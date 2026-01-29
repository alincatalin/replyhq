package dev.replyhq.sdk.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import dev.replyhq.sdk.config.ChatTheme as ChatThemeConfig
import dev.replyhq.sdk.config.DarkMode

@Composable
fun ReplyHQTheme(
    config: ChatThemeConfig = ChatThemeConfig(),
    content: @Composable () -> Unit
) {
    val isDark = when (config.darkMode) {
        DarkMode.LIGHT -> false
        DarkMode.DARK -> true
        DarkMode.SYSTEM -> isSystemInDarkTheme()
    }
    
    val accentColor = Color(config.accentColor)
    
    val colors = if (isDark) {
        ChatColors.dark(accentColor)
    } else {
        ChatColors.light(accentColor)
    }
    
    val typography = ChatTypography.default
    
    CompositionLocalProvider(
        LocalChatColors provides colors,
        LocalChatTypography provides typography
    ) {
        content()
    }
}

object ReplyHQThemeDefaults {
    val colors: ChatColors
        @Composable
        @ReadOnlyComposable
        get() = LocalChatColors.current
    
    val typography: ChatTypography
        @Composable
        @ReadOnlyComposable
        get() = LocalChatTypography.current
}
