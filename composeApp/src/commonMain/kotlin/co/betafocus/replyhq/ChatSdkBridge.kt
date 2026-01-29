package co.betafocus.replyhq

import dev.replyhq.sdk.config.ChatConfig

expect fun initChatSdk(appId: String, apiKey: String, config: ChatConfig? = null)
