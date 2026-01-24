package dev.replyhq.sdk.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.dp
import dev.replyhq.sdk.ChatSDK
import dev.replyhq.sdk.config.BubblePosition
import dev.replyhq.sdk.config.ChatTheme as ChatThemeConfig
import dev.replyhq.sdk.ui.theme.ReplyHQTheme
import dev.replyhq.sdk.ui.theme.ReplyHQThemeDefaults

@Composable
fun BoxScope.ChatBubble(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isInitialized by ChatSDK.isInitialized.collectAsState()
    val themeConfig = if (isInitialized) ChatSDK.config.theme else ChatThemeConfig()
    val unreadCountState = if (isInitialized) {
        ChatSDK.unreadCount.collectAsState()
    } else {
        mutableStateOf(0)
    }
    val unreadCount = unreadCountState.value
    
    ReplyHQTheme(config = themeConfig) {
        val colors = ReplyHQThemeDefaults.colors
        val typography = ReplyHQThemeDefaults.typography
        
        val alignment = when (themeConfig.bubblePosition) {
            BubblePosition.BOTTOM_LEFT -> Alignment.BottomStart
            BubblePosition.BOTTOM_RIGHT -> Alignment.BottomEnd
        }
        
        Box(
            modifier = modifier
                .align(alignment)
                .padding(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .shadow(8.dp, CircleShape)
                    .clip(CircleShape)
                    .background(colors.accent)
                    .clickable(onClick = onClick),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.MailOutline,
                    contentDescription = "Open chat",
                    tint = colors.userBubbleText,
                    modifier = Modifier.size(24.dp)
                )
            }
            
            if (unreadCount > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 4.dp, y = (-4).dp)
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(colors.error),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (unreadCount > 99) "99+" else unreadCount.toString(),
                        style = typography.unreadBadge,
                        color = colors.userBubbleText
                    )
                }
            }
        }
    }
}
