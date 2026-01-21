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
    val maxRetries: Int = 3
)
