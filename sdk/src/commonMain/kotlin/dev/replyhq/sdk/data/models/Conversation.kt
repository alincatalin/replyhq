package dev.replyhq.sdk.data.models

import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

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
    @Serializable(with = InstantSerializer::class)
    val createdAt: Instant,
    @SerialName("updated_at")
    @Serializable(with = InstantSerializer::class)
    val updatedAt: Instant,
    val metadata: Map<String, JsonElement> = emptyMap()
)
