package dev.replyhq.sdk

import dev.replyhq.sdk.config.ChatConfig
import dev.replyhq.sdk.config.ChatUser
import dev.replyhq.sdk.data.models.Conversation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ChatSDKBridge {
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    fun initialize(appId: String, apiKey: String) {
        ChatSDK.init(appId, apiKey)
    }

    fun initialize(config: ChatConfig) {
        ChatSDK.init(config)
    }

    fun setUser(user: ChatUser, completion: (Conversation?, String?) -> Unit) {
        scope.launch {
            val result = ChatSDK.setUser(user)
            completion(result.getOrNull(), result.exceptionOrNull()?.message)
        }
    }

    fun clearUser(completion: (() -> Unit)? = null) {
        scope.launch {
            ChatSDK.clearUser()
            completion?.invoke()
        }
    }

    fun reset() {
        ChatSDK.reset()
    }

    fun handlePush(payload: Map<String, String>, showNotification: Boolean = true) {
        ChatSDK.handlePushNotification(payload, showNotification)
    }
}
