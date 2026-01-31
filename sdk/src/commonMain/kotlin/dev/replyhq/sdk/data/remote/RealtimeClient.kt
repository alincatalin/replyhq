package dev.replyhq.sdk.data.remote

import dev.replyhq.sdk.config.NetworkConfig
import dev.replyhq.sdk.util.DebugLogger
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.WebSocketSession
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

enum class RealtimeConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING
}

class RealtimeClient(
    private val appId: String,
    private val apiKey: String,
    private val deviceId: String,
    private val baseUrl: String = NetworkConfig.DEFAULT_WS_URL
) {
    companion object {
        private const val HEARTBEAT_INTERVAL_MS = 30_000L
    }
    
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
        classDiscriminator = "type"
    }
    
    private val client = HttpClient {
        install(WebSockets)
    }
    
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var session: WebSocketSession? = null
    private var connectionJob: Job? = null
    private var heartbeatJob: Job? = null
    
    private val _events = MutableSharedFlow<RealtimeEvent>(replay = 0, extraBufferCapacity = 64)
    val events: Flow<RealtimeEvent> = _events.asSharedFlow()
    
    private val _connectionState = MutableStateFlow(RealtimeConnectionState.DISCONNECTED)
    val connectionState: StateFlow<RealtimeConnectionState> = _connectionState.asStateFlow()
    
    private val outgoingMessages = Channel<String>(Channel.BUFFERED)

    private fun logDebug(message: String) {
        DebugLogger.log("RealtimeClient", message)
    }

    private fun maskApiKey(value: String): String {
        if (value.length <= 6) return "***"
        return value.take(3) + "..." + value.takeLast(2)
    }
    
    suspend fun connect() {
        if (_connectionState.value == RealtimeConnectionState.CONNECTED ||
            _connectionState.value == RealtimeConnectionState.CONNECTING) {
            return
        }
        
        _connectionState.value = RealtimeConnectionState.CONNECTING
        
        connectionJob = scope.launch {
            try {
                val wsUrl = "$baseUrl?app_id=$appId&api_key=$apiKey&device_id=$deviceId"
                logDebug("Connecting to $baseUrl (appId=$appId deviceId=$deviceId apiKey=${maskApiKey(apiKey)})")
                client.webSocket(wsUrl) {
                    session = this
                    _connectionState.value = RealtimeConnectionState.CONNECTED
                    logDebug("WebSocket connected")
                    
                    startHeartbeat()
                    
                    val sendJob = launch {
                        for (message in outgoingMessages) {
                            logDebug("Sending event: ${message.take(200)}")
                            send(Frame.Text(message))
                        }
                    }
                    
                    try {
                        for (frame in incoming) {
                            when (frame) {
                                is Frame.Text -> {
                                    val text = frame.readText()
                                    logDebug("Received frame: ${text.take(200)}")
                                    parseAndEmitEvent(text)
                                }
                                is Frame.Ping -> {
                                    logDebug("Received ping; sending pong")
                                    send(Frame.Pong(frame.data))
                                }
                                is Frame.Pong -> {
                                    logDebug("Received pong")
                                }
                                else -> {}
                            }
                        }
                    } finally {
                        sendJob.cancel()
                        val reason = closeReason.await()
                        if (reason != null) {
                            logDebug("WebSocket closed: ${reason.code} ${reason.message}")
                        } else {
                            logDebug("WebSocket closed (no reason provided)")
                        }
                    }
                }
            } catch (e: Exception) {
                logDebug("WebSocket connection error: ${e.message}")
                _connectionState.value = RealtimeConnectionState.DISCONNECTED
            } finally {
                stopHeartbeat()
                session = null
                if (_connectionState.value != RealtimeConnectionState.DISCONNECTED) {
                    _connectionState.value = RealtimeConnectionState.DISCONNECTED
                }
                logDebug("Connection state -> DISCONNECTED")
            }
        }
    }
    
    suspend fun disconnect() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        connectionJob?.cancel()
        connectionJob = null
        session?.close()
        session = null
        _connectionState.value = RealtimeConnectionState.DISCONNECTED
        logDebug("Disconnect requested")
    }
    
    suspend fun sendUserTyping(conversationId: String, isTyping: Boolean) {
        val event = UserTypingEvent(conversationId = conversationId, isTyping = isTyping)
        sendEvent(event)
    }

    suspend fun subscribe(conversationId: String) {
        val event = SubscribeEvent(conversationId = conversationId)
        sendEvent(event)
    }
    
    private suspend fun sendPing() {
        val event = PingEvent
        sendEvent(event)
    }
    
    private suspend fun sendEvent(event: ClientEvent) {
        if (_connectionState.value != RealtimeConnectionState.CONNECTED) return
        val message = json.encodeToString(event)
        outgoingMessages.send(message)
    }
    
    private fun startHeartbeat() {
        heartbeatJob = scope.launch {
            while (isActive && _connectionState.value == RealtimeConnectionState.CONNECTED) {
                delay(HEARTBEAT_INTERVAL_MS)
                try {
                    sendPing()
                } catch (e: Exception) {
                    logDebug("Heartbeat failed: ${e.message}")
                    break
                }
            }
        }
    }
    
    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }
    
    private suspend fun parseAndEmitEvent(text: String) {
        try {
            val jsonObject = json.decodeFromString<JsonObject>(text)
            val type = jsonObject["type"]?.jsonPrimitive?.content ?: return
            logDebug("Parsed event type=$type")
            
            val event: RealtimeEvent = when (type) {
                "message.new" -> json.decodeFromString<MessageNewEvent>(text)
                "agent.typing" -> json.decodeFromString<AgentTypingEvent>(text)
                "connection.established" -> json.decodeFromString<ConnectionEstablishedEvent>(text)
                "pong" -> json.decodeFromString<PongEvent>(text)
                "error" -> json.decodeFromString<ErrorEvent>(text)
                else -> return
            }
            
            _events.emit(event)
        } catch (e: Exception) {
            // Skip malformed events
            logDebug("Failed to parse event: ${e.message}")
        }
    }
    
    fun close() {
        scope.launch { disconnect() }
        client.close()
    }
}
