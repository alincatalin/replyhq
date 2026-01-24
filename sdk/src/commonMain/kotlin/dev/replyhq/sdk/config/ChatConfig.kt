package dev.replyhq.sdk.config

data class ChatConfig(
    val appId: String,
    val apiKey: String,
    val user: ChatUser? = null,
    val theme: ChatTheme = ChatTheme(),
    val behavior: ChatBehavior = ChatBehavior(),
    val network: NetworkConfig = NetworkConfig()
)
