package co.betafocus.replyhq

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeContentPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import dev.replyhq.sdk.ChatSDK
import dev.replyhq.sdk.config.BubblePosition
import dev.replyhq.sdk.config.ChatBehavior
import dev.replyhq.sdk.config.ChatConfig
import dev.replyhq.sdk.config.ChatTheme
import dev.replyhq.sdk.config.ChatUser
import dev.replyhq.sdk.config.DarkMode
import dev.replyhq.sdk.config.NetworkConfig
import dev.replyhq.sdk.config.RetryPolicy
import dev.replyhq.sdk.ui.ChatBubble
import dev.replyhq.sdk.ui.ChatScreen
import kotlinx.coroutines.launch
import kotlin.time.Duration.Companion.seconds

@Composable
@Preview
fun App(startChatOpen: Boolean = false) {
    MaterialTheme {
        val scrollState = rememberScrollState()
        val scope = rememberCoroutineScope()
        val isInitialized by ChatSDK.isInitialized.collectAsState()

        var appId by remember { mutableStateOf("YOUR_APP_ID") }
        var apiKey by remember { mutableStateOf("YOUR_API_KEY") }
        var userId by remember { mutableStateOf("user_123") }
        var userName by remember { mutableStateOf("Alex Rivera") }
        var userEmail by remember { mutableStateOf("alex@example.com") }
        var useLocalhost by remember { mutableStateOf(false) }
        var localHost by remember { mutableStateOf("localhost") }
        var localPort by remember { mutableStateOf("3000") }
        var status by remember { mutableStateOf<String?>(null) }
        var chatOpen by remember(startChatOpen) { mutableStateOf(startChatOpen) }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
        ) {
            Column(
                modifier = Modifier
                    .safeContentPadding()
                    .verticalScroll(scrollState)
                    .padding(16.dp)
                    .fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "ReplyHQ SDK Sample",
                    style = MaterialTheme.typography.headlineMedium
                )
                Text(
                    text = "Initialize the SDK, set a user, and open chat.",
                    style = MaterialTheme.typography.bodyMedium
                )

                Text(text = "Network", style = MaterialTheme.typography.titleMedium)

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(
                        onClick = { useLocalhost = false },
                        enabled = !useLocalhost
                    ) {
                        Text("Production")
                    }
                    Button(
                        onClick = { useLocalhost = true },
                        enabled = useLocalhost.not()
                    ) {
                        Text("Localhost")
                    }
                }

                if (useLocalhost) {
                    OutlinedTextField(
                        value = localHost,
                        onValueChange = { localHost = it },
                        label = { Text("Host (Android emulator: 10.0.2.2)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = localPort,
                        onValueChange = { localPort = it },
                        label = { Text("Port") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Divider()

                OutlinedTextField(
                    value = appId,
                    onValueChange = { appId = it },
                    label = { Text("App ID") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    label = { Text("API Key") },
                    modifier = Modifier.fillMaxWidth()
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Button(
                        onClick = {
                            if (appId.isBlank()) {
                                status = "App ID is required."
                                return@Button
                            }
                            if (apiKey.isBlank()) {
                                status = "API Key is required."
                                return@Button
                            }
                            if (isInitialized) {
                                status = "SDK already initialized."
                                return@Button
                            }
                            runCatching {
                                val config = if (useLocalhost) {
                                    val host = localHost.trim().ifBlank { "localhost" }
                                    val port = localPort.toIntOrNull() ?: 3000
                                    ChatConfig(
                                        appId = appId,
                                        apiKey = apiKey,
                                        network = NetworkConfig.localhost(host, port)
                                    )
                                } else {
                                    null
                                }
                                initChatSdk(appId, apiKey, config)
                            }.onSuccess {
                                status = "Initialized with minimal config."
                            }.onFailure { error ->
                                status = "Init failed: ${error.message}"
                            }
                        },
                        enabled = !isInitialized
                    ) {
                        Text("Init minimal")
                    }

                    Button(
                        onClick = {
                            if (appId.isBlank()) {
                                status = "App ID is required."
                                return@Button
                            }
                            if (apiKey.isBlank()) {
                                status = "API Key is required."
                                return@Button
                            }
                            if (isInitialized) {
                                status = "SDK already initialized."
                                return@Button
                            }
                            val networkConfig = if (useLocalhost) {
                                val host = localHost.trim().ifBlank { "localhost" }
                                val port = localPort.toIntOrNull() ?: 3000
                                NetworkConfig.localhost(host, port)
                            } else {
                                NetworkConfig()
                            }
                            val config = ChatConfig(
                                appId = appId,
                                apiKey = apiKey,
                                theme = ChatTheme(
                                    accentColor = 0xFF16A34AL,
                                    bubblePosition = BubblePosition.BOTTOM_RIGHT,
                                    darkMode = DarkMode.SYSTEM
                                ),
                                behavior = ChatBehavior(
                                    showBubble = true,
                                    enableOfflineQueue = true,
                                    maxOfflineMessages = 50,
                                    attachmentsEnabled = false,
                                    typingIndicators = true
                                ),
                                network = NetworkConfig(
                                    timeout = 15.seconds,
                                    retryPolicy = RetryPolicy.EXPONENTIAL_BACKOFF,
                                    maxRetries = 3,
                                    baseUrl = networkConfig.baseUrl,
                                    websocketUrl = networkConfig.websocketUrl
                                )
                            )

                            runCatching {
                                initChatSdk(appId, apiKey, config)
                            }.onSuccess {
                                status = "Initialized with full config."
                            }.onFailure { error ->
                                status = "Init failed: ${error.message}"
                            }
                        },
                        enabled = !isInitialized
                    ) {
                        Text("Init full config")
                    }

                    Button(
                        onClick = {
                            ChatSDK.reset()
                            status = "SDK reset."
                        },
                        enabled = isInitialized
                    ) {
                        Text("Reset")
                    }
                }

                status?.let {
                    Text(text = it, style = MaterialTheme.typography.bodySmall)
                }

                Divider()

                Text(text = "User session", style = MaterialTheme.typography.titleMedium)

                OutlinedTextField(
                    value = userId,
                    onValueChange = { userId = it },
                    label = { Text("User ID") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = userName,
                    onValueChange = { userName = it },
                    label = { Text("Name") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = userEmail,
                    onValueChange = { userEmail = it },
                    label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth()
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Button(
                        onClick = {
                            if (!isInitialized) {
                                status = "Initialize the SDK first."
                                return@Button
                            }
                            if (userId.isBlank()) {
                                status = "User ID is required."
                                return@Button
                            }
                            scope.launch {
                                val result = ChatSDK.setUser(
                                    ChatUser(
                                        id = userId.trim(),
                                        name = userName.trim().ifBlank { null },
                                        email = userEmail.trim().ifBlank { null }
                                    )
                                )
                                status = result.fold(
                                    onSuccess = { "User set. Conversation: ${it.id}" },
                                    onFailure = {
                                        println("Set user failed: ${it.message}")
                                        "Set user failed: ${it.message}"
                                    }
                                )
                            }
                        },
                        enabled = isInitialized
                    ) {
                        Text("Set user")
                    }

                    Button(
                        onClick = {
                            if (!isInitialized) {
                                status = "Initialize the SDK first."
                                return@Button
                            }
                            scope.launch {
                                ChatSDK.clearUser()
                                status = "User cleared."
                            }
                        },
                        enabled = isInitialized
                    ) {
                        Text("Clear user")
                    }

                    Button(
                        onClick = { chatOpen = true },
                        enabled = isInitialized
                    ) {
                        Text("Open chat")
                    }
                }

                Spacer(modifier = Modifier.height(80.dp))
            }

            if (isInitialized) {
                ChatBubble(
                    onClick = { chatOpen = true },
                    modifier = Modifier.fillMaxSize()
                )
            }

            if (chatOpen) {
                ChatScreen(
                    onDismiss = { chatOpen = false },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}
