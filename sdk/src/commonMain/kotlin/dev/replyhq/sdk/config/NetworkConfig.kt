package dev.replyhq.sdk.config

import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

enum class RetryPolicy {
    EXPONENTIAL_BACKOFF,
    LINEAR,
    NONE
}

data class NetworkConfig(
    val timeout: Duration = 30.seconds,
    val retryPolicy: RetryPolicy = RetryPolicy.EXPONENTIAL_BACKOFF,
    val maxRetries: Int = 3,
    val baseUrl: String = DEFAULT_BASE_URL,
    val websocketUrl: String = DEFAULT_WS_URL
) {

    companion object {
        const val DEFAULT_BASE_URL = "https://replyhq.xyz/api/v1"
        const val DEFAULT_WS_URL = "wss://replyhq.xyz/api/v1/socket.io/"
        const val SOCKET_IO_PATH = "/v1/socket.io"

        fun localhost(host: String = "localhost", port: Int = 3000): NetworkConfig {
            val httpBaseUrl = "http://$host:$port/v1"
            val wsBaseUrl = "ws://$host:$port/v1/socket.io/"
            return NetworkConfig(baseUrl = httpBaseUrl, websocketUrl = wsBaseUrl)
        }
    }
}
