package dev.replyhq.sdk.data.local

import dev.replyhq.sdk.data.models.Message
import dev.replyhq.sdk.data.models.MessageStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

class MessageQueue(
    private val database: ChatDatabaseWrapper,
    private val maxRetries: Int = 3
) {
    @OptIn(ExperimentalTime::class)
    suspend fun enqueue(message: Message): Message {
        val queuedMessage = message.copy(
            status = MessageStatus.QUEUED,
            sentAt = if (message.sentAt == Instant.DISTANT_PAST) Clock.System.now() else message.sentAt
        )
        database.insertMessage(queuedMessage)
        return queuedMessage
    }

    fun getQueuedMessages(): Flow<List<Message>> {
        return database.getQueuedMessages()
    }

    fun getPendingMessages(): Flow<List<Message>> {
        return database.getPendingMessages()
    }

    suspend fun markAsSending(localId: String) {
        database.updateMessageStatus(localId, MessageStatus.SENDING)
    }

    suspend fun markAsSent(localId: String, serverId: String) {
        database.updateMessageServerId(localId, serverId, MessageStatus.SENT)
    }

    suspend fun markAsDelivered(localId: String) {
        database.updateMessageStatus(localId, MessageStatus.DELIVERED)
    }

    suspend fun markAsRead(localId: String) {
        database.updateMessageStatus(localId, MessageStatus.READ)
    }

    suspend fun markAsFailed(localId: String) {
        database.updateMessageStatus(localId, MessageStatus.FAILED)
    }

    suspend fun incrementRetryAndCheckLimit(localId: String): Boolean {
        database.incrementRetryCount(localId)
        val retryCount = database.getRetryCount(localId)
        if (retryCount >= maxRetries) {
            markAsFailed(localId)
            return false
        }
        return true
    }

    suspend fun getMessageByLocalId(localId: String): Message? {
        return database.getMessageByLocalId(localId).first()
    }

    suspend fun getRetryCount(localId: String): Int {
        return database.getRetryCount(localId)
    }

    suspend fun requeueFailedMessages() {
        val queuedMessages = database.getQueuedMessages().first()
        queuedMessages
            .filter { it.status == MessageStatus.FAILED }
            .forEach { message ->
                val retryCount = database.getRetryCount(message.localId)
                if (retryCount < maxRetries) {
                    database.updateMessageStatus(message.localId, MessageStatus.QUEUED)
                }
            }
    }

    suspend fun clearQueue() {
        database.deleteAllMessages()
    }
}
