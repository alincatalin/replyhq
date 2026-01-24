package dev.replyhq.sdk.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

@Immutable
data class ChatColors(
    val accent: Color,
    val userBubble: Color,
    val userBubbleText: Color,
    val agentBubble: Color,
    val agentBubbleText: Color,
    val systemBubble: Color,
    val systemBubbleText: Color,
    val background: Color,
    val surface: Color,
    val onSurface: Color,
    val onSurfaceVariant: Color,
    val inputBackground: Color,
    val inputText: Color,
    val inputPlaceholder: Color,
    val divider: Color,
    val error: Color,
    val success: Color
) {
    companion object {
        fun light(accent: Color = Color(0xFF007AFF)): ChatColors = ChatColors(
            accent = accent,
            userBubble = accent,
            userBubbleText = Color.White,
            agentBubble = Color(0xFFE9E9EB),
            agentBubbleText = Color(0xFF1C1C1E),
            systemBubble = Color(0xFFF2F2F7),
            systemBubbleText = Color(0xFF8E8E93),
            background = Color.White,
            surface = Color.White,
            onSurface = Color(0xFF1C1C1E),
            onSurfaceVariant = Color(0xFF8E8E93),
            inputBackground = Color(0xFFF2F2F7),
            inputText = Color(0xFF1C1C1E),
            inputPlaceholder = Color(0xFFC7C7CC),
            divider = Color(0xFFE5E5EA),
            error = Color(0xFFFF3B30),
            success = Color(0xFF34C759)
        )
        
        fun dark(accent: Color = Color(0xFF0A84FF)): ChatColors = ChatColors(
            accent = accent,
            userBubble = accent,
            userBubbleText = Color.White,
            agentBubble = Color(0xFF2C2C2E),
            agentBubbleText = Color.White,
            systemBubble = Color(0xFF1C1C1E),
            systemBubbleText = Color(0xFF8E8E93),
            background = Color(0xFF000000),
            surface = Color(0xFF1C1C1E),
            onSurface = Color.White,
            onSurfaceVariant = Color(0xFF8E8E93),
            inputBackground = Color(0xFF2C2C2E),
            inputText = Color.White,
            inputPlaceholder = Color(0xFF636366),
            divider = Color(0xFF38383A),
            error = Color(0xFFFF453A),
            success = Color(0xFF30D158)
        )
    }
}

val LocalChatColors = staticCompositionLocalOf { ChatColors.light() }
