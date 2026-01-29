package dev.replyhq.sdk.ui

import androidx.compose.ui.window.ComposeUIViewController
import platform.UIKit.UIViewController

fun ReplyHQChatViewController(onDismiss: () -> Unit): UIViewController {
    return ComposeUIViewController {
        ChatScreen(onDismiss = onDismiss)
    }
}
