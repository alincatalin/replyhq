package dev.replyhq.sdk.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import dev.replyhq.sdk.data.models.Message
import dev.replyhq.sdk.data.models.MessageStatus
import dev.replyhq.sdk.data.models.SenderType
import dev.replyhq.sdk.ui.theme.ReplyHQThemeDefaults
import kotlin.time.Instant

@Composable
fun MessageBubble(
    message: Message,
    onRetryClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val colors = ReplyHQThemeDefaults.colors
    val typography = ReplyHQThemeDefaults.typography
    
    val isUser = message.senderType == SenderType.USER
    val isSystem = message.senderType == SenderType.SYSTEM
    
    val bubbleColor = when {
        isUser -> colors.userBubble
        isSystem -> colors.systemBubble
        else -> colors.agentBubble
    }
    
    val textColor = when {
        isUser -> colors.userBubbleText
        isSystem -> colors.systemBubbleText
        else -> colors.agentBubbleText
    }
    
    val horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = horizontalArrangement
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isUser) 16.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 16.dp
                    )
                )
                .background(bubbleColor)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Text(
                text = message.content,
                style = typography.messageBody,
                color = textColor
            )
            
            Row(
                modifier = Modifier.padding(top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = formatTimestamp(message.sentAt),
                    style = typography.messageTimestamp,
                    color = textColor.copy(alpha = 0.7f)
                )
                
                if (isUser) {
                    MessageStatusIndicator(
                        status = message.status,
                        onRetryClick = onRetryClick,
                        tint = textColor.copy(alpha = 0.7f)
                    )
                }
            }
        }
    }
}

@Composable
private fun MessageStatusIndicator(
    status: MessageStatus,
    onRetryClick: (() -> Unit)?,
    tint: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier
) {
    when (status) {
        MessageStatus.QUEUED, MessageStatus.SENDING -> {
            CircularProgressIndicator(
                modifier = modifier.size(12.dp),
                strokeWidth = 1.5.dp,
                color = tint
            )
        }
        MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ -> {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = status.name,
                modifier = modifier.size(12.dp),
                tint = if (status == MessageStatus.READ) {
                    ReplyHQThemeDefaults.colors.accent
                } else {
                    tint
                }
            )
        }
        MessageStatus.FAILED -> {
            Box(
                modifier = modifier
                    .clickable(enabled = onRetryClick != null) { onRetryClick?.invoke() }
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "Tap to retry",
                        modifier = Modifier.size(12.dp),
                        tint = ReplyHQThemeDefaults.colors.error
                    )
                    Text(
                        text = "Retry",
                        style = ReplyHQThemeDefaults.typography.messageStatus,
                        color = ReplyHQThemeDefaults.colors.error
                    )
                }
            }
        }
    }
}

private fun formatTimestamp(instant: Instant): String {
    val epochSeconds = instant.epochSeconds
    val hours = ((epochSeconds % 86400) / 3600).toInt()
    val minutes = ((epochSeconds % 3600) / 60).toInt()
    return "${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}"
}
