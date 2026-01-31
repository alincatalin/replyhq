package dev.replyhq.sdk.util

object DebugLogger {
    private var enabled = false

    fun setEnabled(value: Boolean) {
        enabled = value
    }

    fun isEnabled(): Boolean = enabled

    fun log(tag: String, message: String) {
        if (!enabled) return
        println("[ReplyHQ] $tag: $message")
    }
}
