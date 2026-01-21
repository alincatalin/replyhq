package dev.replyhq.sdk.data.models

import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ConversationStatus {
    @SerialName("open")
    OPEN,
    @SerialName("resolved")
    RESOLVED
}

@Serializable
data class Conversation(
    val id: String,
    @SerialName("visitor_id")
    val visitorId: String? = null,
    val status: ConversationStatus = ConversationStatus.OPEN,
    @SerialName("created_at")
    val createdAt: Instant,
    @SerialName("updated_at")
    val updatedAt: Instant,
    val metadata: Map<String, String> = emptyMap()
)
