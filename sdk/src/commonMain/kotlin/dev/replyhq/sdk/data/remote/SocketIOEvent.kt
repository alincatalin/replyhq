package dev.replyhq.sdk.data.remote

import kotlinx.serialization.json.JsonObject

/**
 * Sealed class hierarchy for all Socket.IO events received from server
 */
sealed class SocketIOEvent {
    /**
     * Connection established event
     */
    data class ConnectionEstablished(val connectionId: String) : SocketIOEvent()

    /**
     * New message from server
     */
    data class MessageNew(val data: JsonObject) : SocketIOEvent()

    /**
     * Agent typing indicator
     */
    data class AgentTyping(val conversationId: String, val isTyping: Boolean) : SocketIOEvent()

    /**
     * Conversation joined successfully
     */
    data class ConversationJoined(val conversationId: String, val lastMessageId: String?) : SocketIOEvent()

    /**
     * Server is shutting down - client should reconnect after delay
     */
    data class ServerShutdown(val reconnectDelayMs: Long) : SocketIOEvent()

    /**
     * Error event from server
     */
    data class Error(val code: String, val message: String?) : SocketIOEvent()

    /**
     * Connected event confirmation
     */
    object Connected : SocketIOEvent()

    /**
     * Disconnected event
     */
    object Disconnected : SocketIOEvent()

    /**
     * Pong response to ping
     */
    object Pong : SocketIOEvent()
}
