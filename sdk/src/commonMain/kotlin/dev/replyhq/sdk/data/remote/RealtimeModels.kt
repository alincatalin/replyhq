package dev.replyhq.sdk.data.remote

import dev.replyhq.sdk.data.models.Message
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
sealed interface RealtimeEvent {
}

@Serializable
@SerialName("message.new")
data class MessageNewEvent(
    val message: Message
) : RealtimeEvent

@Serializable
@SerialName("agent.typing")
data class AgentTypingEvent(
    @SerialName("conversation_id")
    val conversationId: String,
    @SerialName("is_typing")
    val isTyping: Boolean
) : RealtimeEvent

@Serializable
@SerialName("connection.established")
data class ConnectionEstablishedEvent(
    @SerialName("connection_id")
    val connectionId: String
) : RealtimeEvent

@Serializable
@SerialName("pong")
object PongEvent : RealtimeEvent

@Serializable
@SerialName("error")
data class ErrorEvent(
    val error: String,
    val code: String? = null
) : RealtimeEvent

@Serializable
sealed interface ClientEvent {
}

@Serializable
@SerialName("user.typing")
data class UserTypingEvent(
    @SerialName("conversation_id")
    val conversationId: String,
    @SerialName("is_typing")
    val isTyping: Boolean
) : ClientEvent

@Serializable
@SerialName("ping")
object PingEvent : ClientEvent

@Serializable
@SerialName("subscribe")
data class SubscribeEvent(
    @SerialName("conversation_id")
    val conversationId: String
) : ClientEvent
