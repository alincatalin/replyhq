package dev.replyhq.sdk.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.replyhq.sdk.ChatSDK
import dev.replyhq.sdk.core.ConnectionState
import dev.replyhq.sdk.data.models.Message
import dev.replyhq.sdk.ui.components.ConnectionStatusBanner
import dev.replyhq.sdk.ui.components.InputBar
import dev.replyhq.sdk.ui.components.MessageList
import dev.replyhq.sdk.ui.components.TypingIndicator
import dev.replyhq.sdk.ui.theme.ReplyHQTheme
import dev.replyhq.sdk.ui.theme.ReplyHQThemeDefaults
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    title: String = "Support",
    subtitle: String? = null
) {
    val themeConfig = ChatSDK.config.theme
    
    ReplyHQTheme(config = themeConfig) {
        val colors = ReplyHQThemeDefaults.colors
        val typography = ReplyHQThemeDefaults.typography
        val scope = rememberCoroutineScope()
        
        val connectionState by ChatSDK.connectionState.collectAsState()
        val currentConversation by ChatSDK.currentConversation.collectAsState()
        var messages by remember { mutableStateOf<List<Message>>(emptyList()) }
        var isAgentTyping by remember { mutableStateOf(false) }
        
        LaunchedEffect(Unit) {
            ChatSDK.open()
            
            launch {
                try {
                    ChatSDK.getMessages().collectLatest { msgs ->
                        messages = msgs.sortedBy { it.sentAt }
                    }
                } catch (e: Exception) {
                    // Handle case when no conversation
                }
            }
            
            launch {
                try {
                    ChatSDK.newMessages.collectLatest { _ ->
                        // Messages already updated via getMessages() flow
                    }
                } catch (e: Exception) {
                    // Handle errors
                }
            }

            launch {
                try {
                    ChatSDK.agentTypingEvents.collectLatest { event ->
                        val activeConversationId = currentConversation?.id
                        if (activeConversationId != null && event.conversationId == activeConversationId) {
                            isAgentTyping = event.isTyping
                        }
                    }
                } catch (e: Exception) {
                    // Handle errors
                }
            }
        }

        LaunchedEffect(currentConversation?.id) {
            isAgentTyping = false
        }
        
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(colors.background)
                .imePadding()
        ) {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = title,
                            style = typography.headerTitle,
                            color = colors.onSurface
                        )
                        if (subtitle != null) {
                            Text(
                                text = subtitle,
                                style = typography.headerSubtitle,
                                color = colors.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = {
                        ChatSDK.close()
                        onDismiss()
                    }) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = colors.onSurface
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.surface
                )
            )
            
            Divider(color = colors.divider, thickness = 0.5.dp)
            
            ConnectionStatusBanner(
                connectionState = connectionState,
                modifier = Modifier.fillMaxWidth()
            )
            
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                MessageList(
                    messages = messages,
                    onRetryMessage = { localId ->
                        scope.launch {
                            ChatSDK.retryFailedMessage(localId)
                        }
                    }
                )
                
                TypingIndicator(
                    isVisible = isAgentTyping,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                )
            }
            
            Divider(color = colors.divider, thickness = 0.5.dp)
            
            InputBar(
                onSendMessage = { content ->
                    scope.launch {
                        try {
                            ChatSDK.sendMessage(content)
                        } catch (e: Exception) {
                            // Handle send error
                        }
                    }
                },
                enabled = connectionState == ConnectionState.CONNECTED,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
