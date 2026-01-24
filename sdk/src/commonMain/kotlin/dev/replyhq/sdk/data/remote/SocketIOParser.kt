package dev.replyhq.sdk.data.remote

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * Socket.IO protocol packet parser
 * Handles both Engine.IO transport layer and Socket.IO protocol layer
 */
object SocketIOParser {
    private val json = Json {
        ignoreUnknownKeys = true
    }

    /**
     * Parse Engine.IO packet format
     * Format: [TYPE_CHAR][optional_payload]
     * Returns the type character and remaining payload
     */
    fun parseEnginePacket(text: String): Pair<Char, String>? {
        if (text.isEmpty()) return null
        val type = text[0]
        val payload = if (text.length > 1) text.substring(1) else ""
        return Pair(type, payload)
    }

    /**
     * Parse Socket.IO packet from Engine.IO message payload
     * Format: [TYPE_DIGIT][/NAMESPACE?][ACK_ID?][[EVENT_NAME, ...DATA]]
     *
     * Examples:
     * - "0/admin,{\"auth\":{...}}" = CONNECT to /admin with auth
     * - "2/client,[\"message:new\",{...}]" = EVENT message:new
     * - "2/client,42,[\"result\",{...}]" = EVENT with ack 42
     * - "3/client,42[\"ok\"]" = ACK response 42
     */
    fun parseSocketIOPacket(data: String): SocketIOPacket? {
        if (data.isEmpty()) return null

        try {
            var index = 0

            // 1. Extract packet type (first digit)
            val typeChar = data[index].digitToIntOrNull() ?: return null
            val type = SocketIOPacketType.fromValue(typeChar) ?: return null
            index++

            // 2. Extract namespace (if starts with /)
            var namespace = "/"
            if (index < data.length && data[index] == '/') {
                val nsEnd = data.indexOf(',', index)
                namespace = if (nsEnd != -1) {
                    data.substring(index, nsEnd)
                } else {
                    data.substring(index)
                }
                index += namespace.length
                if (index < data.length && data[index] == ',') {
                    index++ // skip comma
                }
            }

            // 3. Extract ack ID (if digits before [ or {)
            var ackId: Int? = null
            if (index < data.length && data[index].isDigit()) {
                val ackEnd = index + 1
                while (ackEnd < data.length && data[ackEnd].isDigit()) {
                    ackEnd + 1
                }
                val ackStr = data.substring(index, ackEnd)
                ackId = ackStr.toIntOrNull()
                index = ackEnd
            }

            // 4. Extract data (rest of the payload)
            var parsedData: JsonElement? = null
            if (index < data.length) {
                val dataStr = data.substring(index)
                try {
                    parsedData = json.parseToJsonElement(dataStr)
                } catch (e: Exception) {
                    // Silently ignore JSON parsing errors
                }
            }

            return SocketIOPacket(
                type = type,
                namespace = namespace,
                data = parsedData,
                ackId = ackId
            )
        } catch (e: Exception) {
            return null
        }
    }

    /**
     * Encode a Socket.IO event packet
     * Format: "2/namespace,[\"event\",{data}]" optionally with ack: "2/namespace,42,[\"event\",{data}]"
     */
    fun encodeEvent(
        namespace: String,
        event: String,
        data: JsonObject,
        ackId: Int? = null
    ): String {
        val type = SocketIOPacketType.EVENT.value
        val eventArray = """["$event",$data]"""

        return if (ackId != null) {
            "$type$namespace,$ackId$eventArray"
        } else {
            "$type$namespace,$eventArray"
        }
    }

    /**
     * Encode a Socket.IO connect packet with authentication
     * Format: "0/namespace,{\"auth\":{...}}"
     */
    fun encodeConnect(namespace: String, auth: JsonObject): String {
        val type = SocketIOPacketType.CONNECT.value
        return "$type$namespace,$auth"
    }

    /**
     * Encode a disconnect packet
     */
    fun encodeDisconnect(namespace: String): String {
        val type = SocketIOPacketType.DISCONNECT.value
        return "$type$namespace"
    }

    /**
     * Encode an acknowledgement response packet
     * Format: "3/namespace,ACK_ID[\"response_data\"]"
     */
    fun encodeAck(namespace: String, ackId: Int, data: JsonElement): String {
        val type = SocketIOPacketType.ACK.value
        return "$type$namespace,$ackId[$data]"
    }
}
