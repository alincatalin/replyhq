package dev.replyhq.sdk.core

import dev.replyhq.sdk.data.remote.SocketIOClient
import dev.replyhq.sdk.data.remote.SocketIOConnectionState
import dev.replyhq.sdk.data.remote.SocketIOEvent
import dev.replyhq.sdk.platform.Connectivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.math.min

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING
}

class ConnectionManager(
    private val socketClient: SocketIOClient,
    private val connectivity: Connectivity
) {
    companion object {
        private const val INITIAL_BACKOFF_MS = 1_000L
        private const val MAX_BACKOFF_MS = 30_000L
        private const val BACKOFF_MULTIPLIER = 2.0
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val _state = MutableStateFlow(ConnectionState.DISCONNECTED)
    val state: StateFlow<ConnectionState> = _state.asStateFlow()

    val events: Flow<SocketIOEvent> = socketClient.events

    private var connectionJob: Job? = null
    private var reconnectJob: Job? = null
    private var networkMonitorJob: Job? = null
    private var serverShutdownJob: Job? = null
    private var currentBackoffMs = INITIAL_BACKOFF_MS
    private var isPaused = false
    private var activeConversationId: String? = null

    private fun logDebug(message: String) {
        println("[ConnectionManager] $message")
    }

    fun connect() {
        if (_state.value == ConnectionState.CONNECTED || _state.value == ConnectionState.CONNECTING) {
            return
        }
        if (connectionJob?.isActive == true) {
            return
        }

        isPaused = false
        logDebug("connect() called; starting network monitoring")
        startNetworkMonitoring()
        doConnect()
    }

    fun disconnect() {
        isPaused = false
        stopNetworkMonitoring()
        reconnectJob?.cancel()
        reconnectJob = null
        serverShutdownJob?.cancel()
        serverShutdownJob = null
        connectionJob?.cancel()
        connectionJob = null

        scope.launch {
            socketClient.disconnect()
        }

        _state.value = ConnectionState.DISCONNECTED
        resetBackoff()
        logDebug("disconnect() called; state -> DISCONNECTED")
    }

    fun setActiveConversation(conversationId: String?) {
        activeConversationId = conversationId
        logDebug("Active conversation set to ${conversationId ?: "null"}")

        if (conversationId != null && _state.value == ConnectionState.CONNECTED) {
            scope.launch {
                socketClient.joinConversation(conversationId)
                logDebug("Joined conversation $conversationId")
            }
        }
    }

    fun pause() {
        isPaused = true
        reconnectJob?.cancel()
        reconnectJob = null
        serverShutdownJob?.cancel()
        serverShutdownJob = null
        connectionJob?.cancel()
        connectionJob = null

        scope.launch {
            socketClient.disconnect()
        }

        _state.value = ConnectionState.DISCONNECTED
        logDebug("pause() called; state -> DISCONNECTED")
    }

    fun resume() {
        if (!isPaused) return
        isPaused = false
        logDebug("resume() called; connectivity=${connectivity.isConnected}")

        if (connectivity.isConnected) {
            doConnect()
        }
    }

    private fun doConnect() {
        println("[ConnectionManager] doConnect() called, isPaused=$isPaused")
        if (isPaused) return
        if (connectionJob?.isActive == true) {
            return
        }

        _state.value = ConnectionState.CONNECTING
        logDebug("doConnect() -> CONNECTING")

        connectionJob?.cancel()
        connectionJob = scope.launch {
            println("[ConnectionManager] About to call socketClient.connect()")
            val stateJob = launch {
                var hasStarted = false
                socketClient.connectionState.collect { ioState ->
                    when (ioState) {
                        SocketIOConnectionState.CONNECTED -> {
                            hasStarted = true
                            _state.value = ConnectionState.CONNECTED
                            resetBackoff()
                            logDebug("Socket.IO state CONNECTED -> state CONNECTED")
                            val conversationId = activeConversationId
                            if (conversationId != null) {
                                socketClient.joinConversation(conversationId)
                                logDebug("Joined conversation $conversationId")
                            }
                        }
                        SocketIOConnectionState.DISCONNECTED -> {
                            if (!hasStarted) {
                                return@collect
                            }
                            if (!isPaused && _state.value == ConnectionState.CONNECTED) {
                                logDebug("Socket.IO DISCONNECTED from CONNECTED; scheduling reconnect")
                                scheduleReconnect()
                            } else if (!isPaused && _state.value == ConnectionState.CONNECTING) {
                                logDebug("Socket.IO DISCONNECTED while CONNECTING; scheduling reconnect")
                                scheduleReconnect()
                            }
                        }
                        SocketIOConnectionState.CONNECTING -> {
                            hasStarted = true
                            _state.value = ConnectionState.CONNECTING
                            logDebug("Socket.IO state CONNECTING -> state CONNECTING")
                        }
                        SocketIOConnectionState.RECONNECTING -> {
                            hasStarted = true
                            _state.value = ConnectionState.RECONNECTING
                            logDebug("Socket.IO state RECONNECTING -> state RECONNECTING")
                        }
                    }
                }
            }
            try {
                socketClient.connect()
                println("[ConnectionManager] socketClient.connect() returned successfully")
            } catch (e: Exception) {
                if (!isPaused) {
                    logDebug("doConnect() failed: ${e.message}; scheduling reconnect")
                    scheduleReconnect()
                }
            } finally {
                stateJob.cancel()
            }
        }

        // Also monitor events for server:shutdown
        scope.launch {
            socketClient.events.collect { event ->
                if (event is SocketIOEvent.ServerShutdown) {
                    handleServerShutdown(event)
                }
            }
        }
    }

    private fun handleServerShutdown(event: SocketIOEvent.ServerShutdown) {
        logDebug("Server shutdown received; will reconnect after ${event.reconnectDelayMs}ms")

        serverShutdownJob?.cancel()
        serverShutdownJob = scope.launch {
            delay(event.reconnectDelayMs)
            if (!isPaused && connectivity.isConnected) {
                resetBackoff()
                doConnect()
            }
        }
    }

    private fun scheduleReconnect() {
        if (isPaused || !connectivity.isConnected) return

        _state.value = ConnectionState.RECONNECTING
        logDebug("scheduleReconnect() in ${currentBackoffMs}ms")

        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(currentBackoffMs)
            currentBackoffMs = min((currentBackoffMs * BACKOFF_MULTIPLIER).toLong(), MAX_BACKOFF_MS)

            if (!isPaused && connectivity.isConnected) {
                doConnect()
            }
        }
    }

    private fun startNetworkMonitoring() {
        if (networkMonitorJob?.isActive == true) {
            return
        }
        connectivity.startMonitoring()
        logDebug("Network monitoring started")

        networkMonitorJob = scope.launch {
            connectivity.connectionState.collect { isConnected ->
                if (isConnected && !isPaused && _state.value == ConnectionState.DISCONNECTED) {
                    resetBackoff()
                    logDebug("Network connected -> attempting connect")
                    doConnect()
                } else if (!isConnected && _state.value != ConnectionState.DISCONNECTED) {
                    reconnectJob?.cancel()
                    _state.value = ConnectionState.DISCONNECTED
                    logDebug("Network disconnected -> state DISCONNECTED")
                }
            }
        }
    }

    private fun stopNetworkMonitoring() {
        networkMonitorJob?.cancel()
        networkMonitorJob = null
        connectivity.stopMonitoring()
        logDebug("Network monitoring stopped")
    }

    private fun resetBackoff() {
        currentBackoffMs = INITIAL_BACKOFF_MS
        logDebug("Backoff reset to $currentBackoffMs ms")
    }
}
