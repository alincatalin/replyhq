package dev.replyhq.sdk

import dev.replyhq.sdk.config.ChatConfig
import dev.replyhq.sdk.config.ChatUser
import dev.replyhq.sdk.core.ConnectionManager
import dev.replyhq.sdk.core.ConnectionState
import dev.replyhq.sdk.core.SessionManager
import dev.replyhq.sdk.core.SyncManager
import dev.replyhq.sdk.data.models.Conversation
import dev.replyhq.sdk.data.models.Message
import dev.replyhq.sdk.data.remote.AgentTypingEvent
import dev.replyhq.sdk.data.remote.PushTokenManager
import dev.replyhq.sdk.data.remote.PushNotificationHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ChatSDKNotInitializedException : IllegalStateException("ChatSDK has not been initialized. Call ChatSDK.init() first.")

class ChatSDKAlreadyInitializedException : IllegalStateException("ChatSDK has already been initialized.")

expect class ChatSDKInitializer {
    val appId: String
    val config: ChatConfig
    
    fun createSessionManager(): SessionManager
    fun createSyncManager(connectionManager: ConnectionManager): SyncManager
    fun createConnectionManager(): ConnectionManager
    fun createPushTokenManager(): PushTokenManager
    fun createPushNotificationHandler(): PushNotificationHandler
}

object ChatSDK {
    private var initializer: ChatSDKInitializer? = null
    private var sessionManager: SessionManager? = null
    private var syncManager: SyncManager? = null
    private var connectionManager: ConnectionManager? = null
    private var pushTokenManager: PushTokenManager? = null
    private var pushNotificationHandler: PushNotificationHandler? = null
    
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    private val _isInitialized = MutableStateFlow(false)
    val isInitialized: StateFlow<Boolean> = _isInitialized.asStateFlow()
    
    val unreadCount: StateFlow<Int>
        get() = syncManager?.unreadCount 
            ?: throw ChatSDKNotInitializedException()
    
    val connectionState: StateFlow<ConnectionState>
        get() = connectionManager?.state 
            ?: throw ChatSDKNotInitializedException()
    
    val currentConversation: StateFlow<Conversation?>
        get() = sessionManager?.currentConversation 
            ?: throw ChatSDKNotInitializedException()
    
    val currentUser: StateFlow<ChatUser?>
        get() = sessionManager?.currentUser 
            ?: throw ChatSDKNotInitializedException()
    
    val newMessages: Flow<Message>
        get() = syncManager?.newMessages 
            ?: throw ChatSDKNotInitializedException()

    val agentTypingEvents: Flow<AgentTypingEvent>
        get() = syncManager?.agentTypingEvents
            ?: throw ChatSDKNotInitializedException()
    
    val config: ChatConfig
        get() = initializer?.config 
            ?: throw ChatSDKNotInitializedException()
    
    fun initialize(initializer: ChatSDKInitializer) {
        if (_isInitialized.value) {
            throw ChatSDKAlreadyInitializedException()
        }
        
        require(initializer.appId.isNotBlank()) { "appId cannot be blank" }
        require(initializer.config.apiKey.isNotBlank()) { "apiKey cannot be blank" }
        
        this.initializer = initializer
        this.connectionManager = initializer.createConnectionManager()
        this.sessionManager = initializer.createSessionManager()
        this.syncManager = initializer.createSyncManager(connectionManager!!)
        this.pushTokenManager = initializer.createPushTokenManager()
        this.pushNotificationHandler = initializer.createPushNotificationHandler()
        
        pushTokenManager?.start()
        _isInitialized.value = true
    }
    
    suspend fun setUser(user: ChatUser): Result<Conversation> {
        val session = sessionManager ?: throw ChatSDKNotInitializedException()
        return session.setUser(user)
    }
    
    suspend fun clearUser() {
        val session = sessionManager ?: throw ChatSDKNotInitializedException()
        session.clearUser()
    }
    
    fun open() {
        val session = sessionManager ?: throw ChatSDKNotInitializedException()
        syncManager?.markAsRead()
        session.onAppForegrounded()
    }
    
    fun close() {
        val session = sessionManager ?: throw ChatSDKNotInitializedException()
        session.onAppBackgrounded()
    }
    
    fun onAppForegrounded() {
        sessionManager?.onAppForegrounded()
        scope.launch {
            val conversationId = currentConversation.value?.id ?: return@launch
            syncManager?.fetchMissedMessages(conversationId)
            syncManager?.syncQueuedMessages()
        }
    }
    
    fun onAppBackgrounded() {
        sessionManager?.onAppBackgrounded()
    }
    
    suspend fun sendMessage(content: String): Message {
        val sync = syncManager ?: throw ChatSDKNotInitializedException()
        val conversationId = currentConversation.value?.id
            ?: throw IllegalStateException("No active conversation. Call setUser() first.")
        
        return sync.sendMessage(conversationId, content)
    }
    
    fun getMessages(): Flow<List<Message>> {
        val sync = syncManager ?: throw ChatSDKNotInitializedException()
        val conversationId = currentConversation.value?.id
            ?: throw IllegalStateException("No active conversation. Call setUser() first.")
        
        return sync.getMessages(conversationId)
    }
    
    suspend fun retryFailedMessage(localId: String): Boolean {
        val sync = syncManager ?: throw ChatSDKNotInitializedException()
        return sync.retryFailedMessage(localId)
    }
    
    fun reset() {
        sessionManager?.reset()
        syncManager?.stop()
        pushTokenManager?.stop()
        pushNotificationHandler = null
        
        initializer = null
        sessionManager = null
        syncManager = null
        connectionManager = null
        pushTokenManager = null
        
        _isInitialized.value = false
    }

    fun requestPushPermission() {
        pushTokenManager?.requestPermission()
    }

    fun updatePushToken(token: String) {
        pushTokenManager?.updateToken(token)
    }

    fun handlePushNotification(payload: Map<String, String>, showNotification: Boolean = true) {
        val handler = pushNotificationHandler ?: return
        handler.handlePushPayload(payload, showNotification)
    }
}
