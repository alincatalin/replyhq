package dev.replyhq.sdk.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import dev.replyhq.sdk.ui.theme.ReplyHQThemeDefaults

@Composable
fun TypingIndicator(
    isVisible: Boolean,
    modifier: Modifier = Modifier
) {
    if (!isVisible) return
    
    val colors = ReplyHQThemeDefaults.colors
    
    val infiniteTransition = rememberInfiniteTransition(label = "typing")
    
    val dot1Offset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = -4f,
        animationSpec = infiniteRepeatable(
            animation = tween(300),
            repeatMode = RepeatMode.Reverse
        ),
        label = "dot1"
    )
    
    val dot2Offset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = -4f,
        animationSpec = infiniteRepeatable(
            animation = tween(300, delayMillis = 100),
            repeatMode = RepeatMode.Reverse
        ),
        label = "dot2"
    )
    
    val dot3Offset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = -4f,
        animationSpec = infiniteRepeatable(
            animation = tween(300, delayMillis = 200),
            repeatMode = RepeatMode.Reverse
        ),
        label = "dot3"
    )
    
    Row(
        modifier = modifier
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(16.dp))
                .background(colors.agentBubble)
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TypingDot(offsetY = dot1Offset)
                TypingDot(offsetY = dot2Offset)
                TypingDot(offsetY = dot3Offset)
            }
        }
    }
}

@Composable
private fun TypingDot(
    offsetY: Float,
    modifier: Modifier = Modifier
) {
    val colors = ReplyHQThemeDefaults.colors
    
    Box(
        modifier = modifier
            .offset(y = offsetY.dp)
            .size(8.dp)
            .clip(CircleShape)
            .background(colors.agentBubbleText.copy(alpha = 0.5f))
    )
}
