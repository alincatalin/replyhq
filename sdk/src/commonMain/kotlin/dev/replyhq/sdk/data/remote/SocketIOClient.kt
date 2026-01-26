package dev.replyhq.sdk.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.URLBuilder
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Socket.IO client implementation for Kotlin Multiplatform
 * Handles connection lifecycle, packet parsing, event routing, and acknowledgements
 */
class SocketIOClient(
    private val appId: String,
    private val apiKey: String,
    private val deviceId: String,
    private val baseUrl: String,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val httpClient = HttpClient {
        install(WebSockets) {
            // Don't install any extensions to avoid OkHttp compression bug
        }
    }

    private var session: io.ktor.websocket.WebSocketSession? = null
    private var connectionJob: Job? = null
    private var pingJob: Job? = null
    private var pendingConnectPacket: String? = null

    private val _events = MutableSharedFlow<SocketIOEvent>(replay = 0, extraBufferCapacity = 64)
    val events = _events.asSharedFlow()

    private val _connectionState = MutableStateFlow(SocketIOConnectionState.DISCONNECTED)
    val connectionState: StateFlow<SocketIOConnectionState> = _connectionState.asStateFlow()

    private val outgoing = Channel<String>(capacity = 64)

    private val ackCounter = AtomicInteger(0)
    private val pendingAcks = ConcurrentHashMap<Int, CompletableDeferred<JsonObject?>>()

    /**
     * Connect to the Socket.IO server
     */
    suspend fun connect() {
        if (_connectionState.value != SocketIOConnectionState.DISCONNECTED) {
            return
        }

        _connectionState.value = SocketIOConnectionState.CONNECTING

        try {
            val url = buildWebSocketUrl()
            println("[SocketIOClient] Connecting to: $url")

            httpClient.webSocket(url) {
                println("[SocketIOClient] WebSocket connected successfully")
                session = this

                // Send Socket.IO connection packet to /client namespace with auth
                val authData = buildJsonObject {
                    put("app_id", appId)
                    put("device_id", deviceId)
                    put("api_key", apiKey)
                }
                val encodedAuth = Json.encodeToString(JsonObject.serializer(), authData)
                // Socket.IO CONNECT packet format (inside Engine.IO MESSAGE): 0<namespace>,<auth_json>
                pendingConnectPacket = "0/client,$encodedAuth"
                println("[SocketIOClient] Prepared Socket.IO CONNECT packet for /client namespace")

                // Start ping loop
                pingJob = scope.launch {
                    pingLoop()
                }

                // Start outgoing message handler
                scope.launch {
                    handleOutgoing()
                }

                // Process incoming messages
                try {
                    println("[SocketIOClient] Starting to process incoming frames...")
                    for (frame in incoming) {
                        println("[SocketIOClient] Received frame: $frame")
                        if (frame is Frame.Text) {
                            val text = frame.readText()
                            println("[SocketIOClient] Received text: $text")
                            handleFrame(text)
                        }
                    }
                    println("[SocketIOClient] Incoming frame loop ended")
                } catch (e: CancellationException) {
                    println("[SocketIOClient] Connection cancelled: ${e.message}")
                } catch (e: Exception) {
                    println("[SocketIOClient] Connection error: ${e.message}")
                    e.printStackTrace()
                } finally {
                    println("[SocketIOClient] WebSocket session closing")
                    session = null
                    pingJob?.cancel()
                    _connectionState.value = SocketIOConnectionState.DISCONNECTED
                    _events.emit(SocketIOEvent.Disconnected)
                }
            }
        } catch (e: Exception) {
            println("[SocketIOClient] Connection failed: ${e.message}")
            e.printStackTrace()
            _connectionState.value = SocketIOConnectionState.DISCONNECTED
            _events.emit(SocketIOEvent.Disconnected)
            throw e
        }
    }

    /**
     * Disconnect from the server
     */
    suspend fun disconnect() {
        connectionJob?.cancel()
        session?.close()
        session = null
        _connectionState.value = SocketIOConnectionState.DISCONNECTED
    }

    /**
     * Close the client
     */
    fun close() {
        scope.coroutineContext.job.cancel()
        httpClient.close()
    }

    /**
     * Handle incoming WebSocket frame
     */
    private suspend fun handleFrame(text: String) {
        try {
            val (engineType, payload) = SocketIOParser.parseEnginePacket(text) ?: return

            when (engineType) {
                '0' -> {
                    // Engine OPEN - receive server config
                    pendingConnectPacket?.let { connectPacket ->
                        session?.send(Frame.Text("4$connectPacket"))
                        println("[SocketIOClient] Sent Socket.IO CONNECT packet after Engine OPEN")
                        pendingConnectPacket = null
                    }
                }

                '2' -> {
                    // Engine PING - respond with pong
                    session?.send(Frame.Text("3"))
                }

                '3' -> {
                    // Engine PONG - connection kept alive
                }

                '4' -> {
                    // Engine MESSAGE - Socket.IO packet
                    handleSocketIOPacket(payload)
                }

                else -> {
                    // Unknown engine type
                }
            }
        } catch (e: Exception) {
            // Silently ignore frame parsing errors
        }
    }

    /**
     * Handle Socket.IO packet
     */
    private suspend fun handleSocketIOPacket(data: String) {
        val packet = SocketIOParser.parseSocketIOPacket(data) ?: return

        when (packet.type) {
            SocketIOPacketType.CONNECT -> {
                _connectionState.value = SocketIOConnectionState.CONNECTED
                _events.emit(SocketIOEvent.Connected)
            }

            SocketIOPacketType.DISCONNECT -> {
                _connectionState.value = SocketIOConnectionState.DISCONNECTED
                _events.emit(SocketIOEvent.Disconnected)
            }

            SocketIOPacketType.EVENT -> {
                if (packet.data != null) {
                    handleEvent(packet)
                }
            }

            SocketIOPacketType.ACK -> {
                if (packet.ackId != null) {
                    handleAck(packet)
                }
            }

            SocketIOPacketType.CONNECT_ERROR -> {
                val error = SocketIOEvent.Error(
                    code = "CONNECT_ERROR",
                    message = packet.data?.toString()
                )
                println("[SocketIOClient] CONNECT_ERROR: ${error.message ?: ""}")
                _events.emit(error)
            }

            else -> {
                // Ignore other packet types (BINARY_EVENT, BINARY_ACK, etc.)
            }
        }
    }

    /**
     * Handle event packet - parse and emit as SocketIOEvent
     */
    private suspend fun handleEvent(packet: SocketIOPacket) {
        try {
            val data = packet.data ?: return

            // Socket.IO event format: [\"eventName\", eventData...]
            val eventArray = data.jsonArray
            if (eventArray.isEmpty()) return

            val eventName = eventArray[0].jsonPrimitive.content
            val eventData = if (eventArray.size > 1) eventArray[1] else null

            when (eventName) {
                "connected" -> {
                    val connectionId = eventData?.jsonObject?.get("connection_id")?.jsonPrimitive?.content
                    if (connectionId != null) {
                        _events.emit(SocketIOEvent.ConnectionEstablished(connectionId))
                    }
                }

                "message:new" -> {
                    if (eventData != null) {
                        _events.emit(SocketIOEvent.MessageNew(eventData.jsonObject))
                    }
                }

                "agent:typing" -> {
                    val conversationId = eventData?.jsonObject?.get("conversation_id")?.jsonPrimitive?.content
                    val isTyping = eventData?.jsonObject?.get("is_typing")?.jsonPrimitive?.boolean
                    if (conversationId != null && isTyping != null) {
                        _events.emit(SocketIOEvent.AgentTyping(conversationId, isTyping))
                    }
                }

                "conversation:joined" -> {
                    val conversationId = eventData?.jsonObject?.get("conversation_id")?.jsonPrimitive?.content
                    val lastMessageId = eventData?.jsonObject?.get("last_message_id")?.jsonPrimitive?.content
                    if (conversationId != null) {
                        _events.emit(SocketIOEvent.ConversationJoined(conversationId, lastMessageId))
                    }
                }

                "server:shutdown" -> {
                    val reconnectDelayMs = eventData?.jsonObject?.get("reconnect_delay_ms")?.jsonPrimitive?.long ?: 5000L
                    _events.emit(SocketIOEvent.ServerShutdown(reconnectDelayMs))
                }

                "error" -> {
                    val code = eventData?.jsonObject?.get("code")?.jsonPrimitive?.content ?: "UNKNOWN_ERROR"
                    val message = eventData?.jsonObject?.get("message")?.jsonPrimitive?.content
                    _events.emit(SocketIOEvent.Error(code, message))
                }

                "pong" -> {
                    _events.emit(SocketIOEvent.Pong)
                }

                else -> {
                    // Unknown event
                }
            }
        } catch (e: Exception) {
            // Silently ignore event parsing errors
        }
    }

    /**
     * Handle acknowledgement packet
     */
    private fun handleAck(packet: SocketIOPacket) {
        val ackId = packet.ackId ?: return
        val deferred = pendingAcks.remove(ackId) ?: return

        try {
            val responseData = (packet.data as? JsonObject)
            deferred.complete(responseData)
        } catch (e: Exception) {
            deferred.completeExceptionally(e)
        }
    }

    /**
     * Emit event with acknowledgement support
     * Waits up to 10 seconds for response
     */
    suspend fun emitWithAck(
        event: String,
        data: JsonObject,
        namespace: String = "/client"
    ): Result<JsonObject?> {
        return try {
            val ackId = ackCounter.incrementAndGet()
            val deferred = CompletableDeferred<JsonObject?>()
            pendingAcks[ackId] = deferred

            val packet = SocketIOParser.encodeEvent(namespace, event, data, ackId)
            outgoing.send(packet)

            val response = withTimeout(10_000) {
                deferred.await()
            }

            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Emit event without acknowledgement
     */
    suspend fun emit(
        event: String,
        data: JsonObject,
        namespace: String = "/client"
    ) {
        try {
            val packet = SocketIOParser.encodeEvent(namespace, event, data)
            outgoing.send(packet)
        } catch (e: Exception) {
            // Silently ignore send errors
        }
    }

    /**
     * Join a conversation
     */
    suspend fun joinConversation(conversationId: String): Result<String?> {
        val data = buildJsonObject {
            put("conversation_id", conversationId)
        }

        return try {
            emitWithAck("conversation:join", data).getOrNull()?.let { response ->
                if (response["success"]?.jsonPrimitive?.boolean == true) {
                    val lastMessageId = response["last_message_id"]?.jsonPrimitive?.content
                    Result.success(lastMessageId)
                } else {
                    Result.failure(Exception(response["error"]?.jsonPrimitive?.content ?: "Unknown error"))
                }
            } ?: Result.failure(Exception("No response"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Leave a conversation
     */
    suspend fun leaveConversation(conversationId: String) {
        val data = buildJsonObject {
            put("conversation_id", conversationId)
        }
        emit("conversation:leave", data)
    }

    /**
     * Start typing in a conversation
     */
    suspend fun startTyping(conversationId: String) {
        val data = buildJsonObject {
            put("conversation_id", conversationId)
        }
        emit("typing:start", data)
    }

    /**
     * Stop typing in a conversation
     */
    suspend fun stopTyping(conversationId: String) {
        val data = buildJsonObject {
            put("conversation_id", conversationId)
        }
        emit("typing:stop", data)
    }

    /**
     * Send ping to keep connection alive
     */
    private suspend fun pingLoop() {
        while (scope.isActive && _connectionState.value == SocketIOConnectionState.CONNECTED) {
            try {
                delay(25000) // 25 seconds
                session?.send(Frame.Text("2")) // Engine PING
            } catch (e: Exception) {
                break
            }
        }
    }

    /**
     * Handle outgoing messages from channel
     */
    private suspend fun handleOutgoing() {
        try {
            for (message in outgoing) {
                try {
                    session?.send(Frame.Text("4$message")) // Wrap in Engine MESSAGE (type 4)
                } catch (e: Exception) {
                    // Silently ignore send errors
                }
            }
        } catch (e: CancellationException) {
            // Channel closed
        }
    }

    /**
     * Build WebSocket URL with query parameters for Socket.IO
     */
    private fun buildWebSocketUrl(): String {
        // Socket.IO URL format: /v1/socket.io/?EIO=4&transport=websocket
        val normalizedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val urlBuilder = URLBuilder(normalizedBaseUrl)
        urlBuilder.parameters.apply {
            append("EIO", "4")  // Engine.IO protocol version
            append("transport", "websocket")
        }
        val finalUrl = urlBuilder.buildString()
        println("[SocketIOClient] Base URL: $baseUrl")
        println("[SocketIOClient] Final Socket.IO URL: $finalUrl")
        return finalUrl
    }
}
