package dev.replyhq.sdk.data.models

import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class SenderType {
    @SerialName("user")
    USER,
    @SerialName("agent")
    AGENT,
    @SerialName("system")
    SYSTEM
}

@Serializable
enum class MessageStatus {
    QUEUED,
    SENDING,
    SENT,
    DELIVERED,
    READ,
    FAILED
}

@Serializable
data class Message(
    val id: String? = null,
    @SerialName("local_id")
    val localId: String,
    @SerialName("conversation_id")
    val conversationId: String,
    @SerialName("body")
    val content: String,
    @SerialName("sender")
    val senderType: SenderType,
    @SerialName("created_at")
    val sentAt: Instant,
    val status: MessageStatus = MessageStatus.QUEUED
)
