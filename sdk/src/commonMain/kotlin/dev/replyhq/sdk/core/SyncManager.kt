package dev.replyhq.sdk.core

import dev.replyhq.sdk.data.local.ChatDatabaseWrapper
import dev.replyhq.sdk.data.local.MessageQueue
import dev.replyhq.sdk.data.local.SdkPreferences
import dev.replyhq.sdk.data.models.Message
import dev.replyhq.sdk.data.models.MessageStatus
import dev.replyhq.sdk.data.models.SenderType
import dev.replyhq.sdk.data.remote.AgentTypingEvent
import dev.replyhq.sdk.data.remote.ChatApi
import dev.replyhq.sdk.data.remote.MessageNewEvent
import dev.replyhq.sdk.data.remote.RealtimeEvent
import dev.replyhq.sdk.data.remote.SocketIOEvent
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

class SyncManager(
    private val chatApi: ChatApi,
    private val messageQueue: MessageQueue,
    private val database: ChatDatabaseWrapper,
    private val preferences: SdkPreferences,
    private val connectionManager: ConnectionManager
) {
    companion object {
        private const val MAX_RETRIES = 3
    }
    
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var syncJob: Job? = null
    private var eventListenerJob: Job? = null
    
    private val _unreadCount = MutableStateFlow(0)
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()
    
    private val _newMessages = MutableSharedFlow<Message>(replay = 0, extraBufferCapacity = 64)
    val newMessages: Flow<Message> = _newMessages.asSharedFlow()

    private val _agentTypingEvents = MutableSharedFlow<AgentTypingEvent>(replay = 0, extraBufferCapacity = 64)
    val agentTypingEvents: Flow<AgentTypingEvent> = _agentTypingEvents.asSharedFlow()

    private var lastKnownMessageId: String? = null
    private var lastAgentMessageId: String? = null

    init {
        _unreadCount.value = preferences.unreadCount
        startEventListener()
    }
    
    @OptIn(ExperimentalUuidApi::class, ExperimentalTime::class)
    suspend fun sendMessage(conversationId: String, content: String): Message {
        val localId = Uuid.random().toString()
        
        val message = Message(
            id = null,
            localId = localId,
            conversationId = conversationId,
            content = content,
            senderType = SenderType.USER,
            sentAt = Clock.System.now(),
            status = MessageStatus.QUEUED
        )
        
        val queuedMessage = messageQueue.enqueue(message)
        
        if (connectionManager.state.value == ConnectionState.CONNECTED) {
            scope.launch {
                sendQueuedMessage(queuedMessage)
            }
        }
        
        return queuedMessage
    }
    
    fun syncQueuedMessages() {
        syncJob?.cancel()
        syncJob = scope.launch {
            val queuedMessages = messageQueue.getQueuedMessages().first()
            
            queuedMessages
                .filter { it.status == MessageStatus.QUEUED }
                .sortedBy { it.sentAt }
                .forEach { message ->
                    sendQueuedMessage(message)
                }
        }
    }
    
    @OptIn(ExperimentalTime::class)
    suspend fun fetchMissedMessages(conversationId: String) {
        var afterSequence = preferences.lastSyncSequence
        var hasMore = true

        while (hasMore) {
            val result = chatApi.syncMessages(conversationId, afterSequence)
            if (result.isFailure) {
                break
            }

            val response = result.getOrNull() ?: break

            response.messages.forEach { serverMessage ->
                val existingMessage = database.getMessageByLocalId(serverMessage.localId).first()
                if (existingMessage == null) {
                    database.insertMessage(serverMessage)
                    if (serverMessage.senderType != SenderType.USER) {
                        incrementUnreadCount()
                        lastAgentMessageId = serverMessage.id
                        serverMessage.id?.let { id ->
                            chatApi.markDelivered(conversationId, listOf(id))
                        }
                        _newMessages.emit(serverMessage)
                    }
                    // Update last known message ID for cursor-based sync
                    lastKnownMessageId = serverMessage.id
                }
            }
            afterSequence = response.lastSequence
            preferences.lastSyncSequence = response.lastSequence
            preferences.lastSyncTimestamp = Clock.System.now().toEpochMilliseconds()
            hasMore = response.hasMore
        }
    }
    
    fun markAsRead() {
        _unreadCount.value = 0
        preferences.unreadCount = 0
        val conversationId = preferences.currentConversationId ?: return
        val upToMessageId = lastAgentMessageId
        scope.launch {
            chatApi.markRead(conversationId, upToMessageId)
        }
    }
    
    fun getMessages(conversationId: String): Flow<List<Message>> {
        return database.getMessagesByConversation(conversationId)
    }
    
    private suspend fun sendQueuedMessage(message: Message) {
        messageQueue.markAsSending(message.localId)
        
        val result = chatApi.sendMessage(
            conversationId = message.conversationId,
            localId = message.localId,
            body = message.content
        )
        
        result.onSuccess { serverMessage ->
            messageQueue.markAsSent(message.localId, serverMessage.id ?: message.localId)
        }.onFailure {
            val canRetry = messageQueue.incrementRetryAndCheckLimit(message.localId)
            if (!canRetry) {
                messageQueue.markAsFailed(message.localId)
            }
        }
    }
    
    private fun startEventListener() {
        eventListenerJob = scope.launch {
            connectionManager.events.collect { event ->
                when (event) {
                    is RealtimeEvent -> handleRealtimeEvent(event)
                    is SocketIOEvent -> handleSocketIOEvent(event)
                    else -> {} // Unknown event type
                }
            }
        }
    }
    
    private suspend fun handleRealtimeEvent(event: RealtimeEvent) {
        when (event) {
            is MessageNewEvent -> {
                val message = event.message
                val existingMessage = database.getMessageByLocalId(message.localId).first()

                if (existingMessage == null) {
                    database.insertMessage(message)

                    if (message.senderType != SenderType.USER) {
                        incrementUnreadCount()
                        lastAgentMessageId = message.id
                        message.id?.let { id ->
                            chatApi.markDelivered(message.conversationId, listOf(id))
                        }
                    }

                    _newMessages.emit(message)
                    lastKnownMessageId = message.id
                } else if (existingMessage.id == null && message.id != null) {
                    messageQueue.markAsSent(message.localId, message.id)
                    lastKnownMessageId = message.id
                }
            }
            is AgentTypingEvent -> {
                _agentTypingEvents.emit(event)
            }
            else -> {}
        }
    }

    private suspend fun handleSocketIOEvent(event: SocketIOEvent) {
        when (event) {
            is SocketIOEvent.MessageNew -> {
                // Parse message from JsonObject
                try {
                    val data = event.data
                    val message = parseMessageFromJson(data)
                    if (message != null) {
                        val existingMessage = database.getMessageByLocalId(message.localId).first()

                        if (existingMessage == null) {
                            database.insertMessage(message)

                            if (message.senderType != SenderType.USER) {
                                incrementUnreadCount()
                                lastAgentMessageId = message.id
                                message.id?.let { id ->
                                    chatApi.markDelivered(message.conversationId, listOf(id))
                                }
                            }

                            _newMessages.emit(message)
                            lastKnownMessageId = message.id
                        } else if (existingMessage.id == null && message.id != null) {
                            messageQueue.markAsSent(message.localId, message.id)
                            lastKnownMessageId = message.id
                        }
                    }
                } catch (e: Exception) {
                    // Silently ignore parse errors
                }
            }
            is SocketIOEvent.ConnectionEstablished -> {
                val conversationId = preferences.currentConversationId ?: return
                scope.launch {
                    fetchMissedMessages(conversationId)
                    syncQueuedMessages()
                }
            }
            is SocketIOEvent.AgentTyping -> {
                // Emit as AgentTypingEvent for compatibility
                _agentTypingEvents.emit(AgentTypingEvent(event.conversationId, event.isTyping))
            }
            is SocketIOEvent.ConversationJoined -> {
                // Update last known message ID from join response
                lastKnownMessageId = event.lastMessageId
            }
            is SocketIOEvent.ServerShutdown -> {
                // Log shutdown event - ConnectionManager handles reconnect
                println("[SyncManager] Server shutdown: will reconnect after ${event.reconnectDelayMs}ms")
            }
            is SocketIOEvent.Error -> {
                println("[SyncManager] Error: ${event.code} - ${event.message}")
            }
            else -> {
                // Ignore other events
            }
        }
    }

    @OptIn(ExperimentalTime::class)
    private fun parseMessageFromJson(data: kotlinx.serialization.json.JsonObject): Message? {
        return try {
            val createdAtRaw = data["created_at"]?.jsonPrimitive?.content
            val createdAt = try {
                if (createdAtRaw != null) {
                    kotlin.time.Instant.parse(createdAtRaw)
                } else {
                    Clock.System.now()
                }
            } catch (e: Exception) {
                Clock.System.now()
            }
            Message(
                id = data["id"]?.jsonPrimitive?.content,
                localId = data["local_id"]?.jsonPrimitive?.content ?: "",
                conversationId = data["conversation_id"]?.jsonPrimitive?.content ?: "",
                content = data["body"]?.jsonPrimitive?.content ?: "",
                senderType = when (data["sender"]?.jsonPrimitive?.content) {
                    "user" -> SenderType.USER
                    "agent" -> SenderType.AGENT
                    "system" -> SenderType.SYSTEM
                    else -> SenderType.USER
                },
                sentAt = createdAt,
                status = when (data["status"]?.jsonPrimitive?.content) {
                    "QUEUED" -> MessageStatus.QUEUED
                    "SENDING" -> MessageStatus.SENDING
                    "SENT" -> MessageStatus.SENT
                    "DELIVERED" -> MessageStatus.DELIVERED
                    "READ" -> MessageStatus.READ
                    "FAILED" -> MessageStatus.FAILED
                    else -> MessageStatus.SENT
                }
            )
        } catch (e: Exception) {
            null
        }
    }
    
    private fun incrementUnreadCount() {
        val newCount = _unreadCount.value + 1
        _unreadCount.value = newCount
        preferences.unreadCount = newCount
    }
    
    suspend fun retryFailedMessage(localId: String): Boolean {
        val message = messageQueue.getMessageByLocalId(localId) ?: return false
        
        if (message.status != MessageStatus.FAILED) return false
        
        messageQueue.markAsSending(localId)
        sendQueuedMessage(message)
        
        return true
    }
    
    fun stop() {
        syncJob?.cancel()
        eventListenerJob?.cancel()
    }
}
