package dev.replyhq.sdk.data.remote

import dev.replyhq.sdk.data.local.SdkPreferences

expect class PushNotificationHandler(
    platformContext: Any?,
    preferences: SdkPreferences
) {
    fun handlePushPayload(payload: Map<String, String>, showNotification: Boolean = true)
}
