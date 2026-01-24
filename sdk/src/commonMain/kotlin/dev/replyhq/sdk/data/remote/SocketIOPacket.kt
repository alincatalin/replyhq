package dev.replyhq.sdk.data.remote

import kotlinx.serialization.json.JsonElement

/**
 * Socket.IO packet types according to Socket.IO protocol
 */
enum class SocketIOPacketType(val value: Int) {
    CONNECT(0),
    DISCONNECT(1),
    EVENT(2),
    ACK(3),
    CONNECT_ERROR(4),
    BINARY_EVENT(5),
    BINARY_ACK(6);

    companion object {
        fun fromValue(value: Int): SocketIOPacketType? {
            return entries.find { it.value == value }
        }
    }
}

/**
 * Socket.IO connection state machine
 */
enum class SocketIOConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
}

/**
 * Socket.IO packet structure
 * Represents a parsed Socket.IO protocol packet
 */
data class SocketIOPacket(
    val type: SocketIOPacketType,
    val namespace: String = "/",
    val data: JsonElement? = null,
    val ackId: Int? = null,
)
