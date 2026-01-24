package dev.replyhq.sdk.data.models

import kotlin.time.Instant
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

object InstantSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("Instant", PrimitiveKind.STRING)
    
    override fun serialize(encoder: Encoder, value: Instant) {
        encoder.encodeString(value.toString())
    }
    
    override fun deserialize(decoder: Decoder): Instant {
        return Instant.parse(decoder.decodeString())
    }
}

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
    @Serializable(with = InstantSerializer::class)
    val sentAt: Instant,
    val status: MessageStatus = MessageStatus.QUEUED
)
