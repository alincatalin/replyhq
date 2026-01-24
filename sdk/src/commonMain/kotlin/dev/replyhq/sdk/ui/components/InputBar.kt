package dev.replyhq.sdk.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import dev.replyhq.sdk.ui.theme.ReplyHQThemeDefaults
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

private const val MAX_MESSAGE_LENGTH = 5000
private const val RATE_LIMIT_MS = 200L

@Composable
fun InputBar(
    onSendMessage: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Type a message...",
    enabled: Boolean = true
) {
    val colors = ReplyHQThemeDefaults.colors
    val typography = ReplyHQThemeDefaults.typography
    
    var text by remember { mutableStateOf("") }
    var lastSendTime by remember { mutableStateOf(0L) }
    
    val canSend = text.isNotBlank() && text.length <= MAX_MESSAGE_LENGTH && enabled
    
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.surface)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        BasicTextField(
            value = text,
            onValueChange = { newText ->
                if (newText.length <= MAX_MESSAGE_LENGTH) {
                    text = newText
                }
            },
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(20.dp))
                .background(colors.inputBackground)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            textStyle = typography.inputText.copy(color = colors.inputText),
            cursorBrush = SolidColor(colors.accent),
            enabled = enabled,
            decorationBox = { innerTextField ->
                if (text.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = typography.inputPlaceholder,
                        color = colors.inputPlaceholder
                    )
                }
                innerTextField()
            }
        )
        
        IconButton(
            onClick = {
                if (canSend) {
                    @OptIn(ExperimentalTime::class)
                    val now = Clock.System.now().toEpochMilliseconds()
                    if (now - lastSendTime >= RATE_LIMIT_MS) {
                        onSendMessage(text.trim())
                        text = ""
                        lastSendTime = now
                    }
                }
            },
            enabled = canSend,
            modifier = Modifier
                .padding(start = 8.dp)
                .size(44.dp)
                .clip(CircleShape)
                .background(if (canSend) colors.accent else colors.inputBackground)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = "Send",
                tint = if (canSend) colors.userBubbleText else colors.inputPlaceholder
            )
        }
    }
}
