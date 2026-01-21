package dev.replyhq.sdk.data.local

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.coroutines.mapToOneOrNull
import dev.replyhq.sdk.data.models.Conversation
import dev.replyhq.sdk.data.models.ConversationStatus
import dev.replyhq.sdk.data.models.Message
import dev.replyhq.sdk.data.models.MessageStatus
import dev.replyhq.sdk.data.models.SenderType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json

class ChatDatabaseWrapper(
    driverFactory: DatabaseDriverFactory
) {
    private val database = ChatDatabase(driverFactory.createDriver())
    private val queries = database.chatQueries
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun insertConversation(conversation: Conversation) {
        queries.insertConversation(
            id = conversation.id,
            visitor_id = conversation.visitorId,
            status = conversation.status.name.lowercase(),
            created_at = conversation.createdAt.toEpochMilliseconds(),
            updated_at = conversation.updatedAt.toEpochMilliseconds(),
            metadata = json.encodeToString(kotlinx.serialization.serializer(), conversation.metadata)
        )
    }

    fun getConversationById(id: String): Flow<Conversation?> {
        return queries.getConversationById(id)
            .asFlow()
            .mapToOneOrNull(Dispatchers.Default)
            .map { it?.toConversation() }
    }

    fun getAllConversations(): Flow<List<Conversation>> {
        return queries.getAllConversations()
            .asFlow()
            .mapToList(Dispatchers.Default)
            .map { list -> list.map { it.toConversation() } }
    }

    suspend fun insertMessage(message: Message, retryCount: Int = 0) {
        queries.insertMessage(
            local_id = message.localId,
            id = message.id,
            conversation_id = message.conversationId,
            content = message.content,
            sender_type = message.senderType.name,
            sent_at = message.sentAt.toEpochMilliseconds(),
            status = message.status.name,
            retry_count = retryCount.toLong()
        )
    }

    fun getMessagesByConversation(conversationId: String): Flow<List<Message>> {
        return queries.getMessagesByConversation(conversationId)
            .asFlow()
            .mapToList(Dispatchers.Default)
            .map { list -> list.map { it.toMessage() } }
    }

    fun getMessageByLocalId(localId: String): Flow<Message?> {
        return queries.getMessageByLocalId(localId)
            .asFlow()
            .mapToOneOrNull(Dispatchers.Default)
            .map { it?.toMessage() }
    }

    fun getQueuedMessages(): Flow<List<Message>> {
        return queries.getQueuedMessages()
            .asFlow()
            .mapToList(Dispatchers.Default)
            .map { list -> list.map { it.toMessage() } }
    }

    fun getPendingMessages(): Flow<List<Message>> {
        return queries.getPendingMessages()
            .asFlow()
            .mapToList(Dispatchers.Default)
            .map { list -> list.map { it.toMessage() } }
    }

    suspend fun updateMessageStatus(localId: String, status: MessageStatus) {
        queries.updateMessageStatus(status.name, localId)
    }

    suspend fun updateMessageServerId(localId: String, serverId: String, status: MessageStatus) {
        queries.updateMessageServerId(serverId, status.name, localId)
    }

    suspend fun incrementRetryCount(localId: String) {
        queries.incrementRetryCount(localId)
    }

    suspend fun getRetryCount(localId: String): Int {
        return queries.getRetryCount(localId).executeAsOneOrNull()?.toInt() ?: 0
    }

    suspend fun deleteMessagesByConversation(conversationId: String) {
        queries.deleteMessagesByConversation(conversationId)
    }

    suspend fun deleteAllMessages() {
        queries.deleteAllMessages()
    }

    suspend fun updateConversationUpdatedAt(conversationId: String, updatedAt: Instant) {
        queries.updateConversationUpdatedAt(updatedAt.toEpochMilliseconds(), conversationId)
    }

    fun getMessagesAfterTimestamp(conversationId: String, timestamp: Instant): Flow<List<Message>> {
        return queries.getMessagesAfterTimestamp(conversationId, timestamp.toEpochMilliseconds())
            .asFlow()
            .mapToList(Dispatchers.Default)
            .map { list -> list.map { it.toMessage() } }
    }

    private fun ConversationEntity.toConversation(): Conversation {
        return Conversation(
            id = id,
            visitorId = visitor_id,
            status = ConversationStatus.valueOf(status.uppercase()),
            createdAt = Instant.fromEpochMilliseconds(created_at),
            updatedAt = Instant.fromEpochMilliseconds(updated_at),
            metadata = json.decodeFromString(metadata)
        )
    }

    private fun MessageEntity.toMessage(): Message {
        return Message(
            id = id,
            localId = local_id,
            conversationId = conversation_id,
            content = content,
            senderType = SenderType.valueOf(sender_type),
            sentAt = Instant.fromEpochMilliseconds(sent_at),
            status = MessageStatus.valueOf(status)
        )
    }
}
