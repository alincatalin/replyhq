package dev.replyhq.sdk.config

enum class DarkMode {
    LIGHT,
    DARK,
    SYSTEM
}

enum class BubblePosition {
    BOTTOM_LEFT,
    BOTTOM_RIGHT
}

data class ChatTheme(
    val accentColor: Long = 0xFF007AFF,
    val bubblePosition: BubblePosition = BubblePosition.BOTTOM_RIGHT,
    val darkMode: DarkMode = DarkMode.SYSTEM
)
