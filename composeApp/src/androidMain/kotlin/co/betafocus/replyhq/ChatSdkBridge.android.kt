package co.betafocus.replyhq

import dev.replyhq.sdk.ChatSDK
import dev.replyhq.sdk.init
import dev.replyhq.sdk.config.ChatConfig

actual fun initChatSdk(appId: String, apiKey: String, config: ChatConfig?) {
    val context = AndroidContextHolder.requireContext()
    if (config != null) {
        ChatSDK.init(context, config)
    } else {
        ChatSDK.init(context, appId, apiKey)
    }
}
