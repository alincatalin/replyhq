package dev.replyhq.sdk.config

data class ChatBehavior(
    val showBubble: Boolean = true,
    val enableOfflineQueue: Boolean = true,
    val maxOfflineMessages: Int = 100,
    val attachmentsEnabled: Boolean = false,
    val typingIndicators: Boolean = true
)
