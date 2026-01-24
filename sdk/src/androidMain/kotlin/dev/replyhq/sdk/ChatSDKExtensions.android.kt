package dev.replyhq.sdk

import android.content.Context
import dev.replyhq.sdk.config.ChatConfig

fun ChatSDK.init(context: Context, appId: String, apiKey: String) {
    initialize(ChatSDKInitializer.create(context, appId, apiKey))
}

fun ChatSDK.init(context: Context, config: ChatConfig) {
    initialize(ChatSDKInitializer.create(context, config))
}
