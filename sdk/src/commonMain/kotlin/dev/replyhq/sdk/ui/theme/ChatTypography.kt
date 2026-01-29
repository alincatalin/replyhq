package dev.replyhq.sdk.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

@Immutable
data class ChatTypography(
    val messageBody: TextStyle,
    val messageTimestamp: TextStyle,
    val messageStatus: TextStyle,
    val inputText: TextStyle,
    val inputPlaceholder: TextStyle,
    val headerTitle: TextStyle,
    val headerSubtitle: TextStyle,
    val systemMessage: TextStyle,
    val unreadBadge: TextStyle
) {
    companion object {
        val default = ChatTypography(
            messageBody = TextStyle(
                fontSize = 16.sp,
                fontWeight = FontWeight.Normal,
                lineHeight = 22.sp
            ),
            messageTimestamp = TextStyle(
                fontSize = 11.sp,
                fontWeight = FontWeight.Normal
            ),
            messageStatus = TextStyle(
                fontSize = 11.sp,
                fontWeight = FontWeight.Normal
            ),
            inputText = TextStyle(
                fontSize = 16.sp,
                fontWeight = FontWeight.Normal
            ),
            inputPlaceholder = TextStyle(
                fontSize = 16.sp,
                fontWeight = FontWeight.Normal
            ),
            headerTitle = TextStyle(
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold
            ),
            headerSubtitle = TextStyle(
                fontSize = 13.sp,
                fontWeight = FontWeight.Normal
            ),
            systemMessage = TextStyle(
                fontSize = 13.sp,
                fontWeight = FontWeight.Normal
            ),
            unreadBadge = TextStyle(
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        )
    }
}

val LocalChatTypography = staticCompositionLocalOf { ChatTypography.default }
