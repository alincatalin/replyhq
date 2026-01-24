package dev.replyhq.sdk

import dev.replyhq.sdk.config.ChatConfig

fun ChatSDK.init(appId: String, apiKey: String) {
    initialize(ChatSDKInitializer.create(appId, apiKey))
}

fun ChatSDK.init(config: ChatConfig) {
    initialize(ChatSDKInitializer.create(config))
}
