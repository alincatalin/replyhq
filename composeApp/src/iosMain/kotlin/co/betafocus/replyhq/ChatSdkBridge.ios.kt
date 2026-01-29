package co.betafocus.replyhq

import dev.replyhq.sdk.ChatSDK
import dev.replyhq.sdk.init
import dev.replyhq.sdk.config.ChatConfig

actual fun initChatSdk(appId: String, apiKey: String, config: ChatConfig?) {
    if (config != null) {
        ChatSDK.init(config)
    } else {
        ChatSDK.init(appId, apiKey)
    }
}
