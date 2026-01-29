package dev.replyhq.sdk.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.replyhq.sdk.core.ConnectionState
import dev.replyhq.sdk.ui.theme.ReplyHQThemeDefaults

@Composable
fun ConnectionStatusBanner(
    connectionState: ConnectionState,
    modifier: Modifier = Modifier
) {
    val colors = ReplyHQThemeDefaults.colors
    val typography = ReplyHQThemeDefaults.typography
    
    val isVisible = connectionState != ConnectionState.CONNECTED
    
    AnimatedVisibility(
        visible = isVisible,
        enter = expandVertically(),
        exit = shrinkVertically(),
        modifier = modifier
    ) {
        val (text, showProgress) = when (connectionState) {
            ConnectionState.DISCONNECTED -> "No connection" to false
            ConnectionState.CONNECTING -> "Connecting..." to true
            ConnectionState.RECONNECTING -> "Reconnecting..." to true
            ConnectionState.CONNECTED -> "" to false
        }
        
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.surface)
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.align(Alignment.Center)
            ) {
                if (showProgress) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(14.dp)
                            .padding(end = 8.dp),
                        strokeWidth = 2.dp,
                        color = colors.onSurfaceVariant
                    )
                }
                Text(
                    text = text,
                    style = typography.systemMessage,
                    color = colors.onSurfaceVariant
                )
            }
        }
    }
}
