package dev.replyhq.sdk.data.remote

import dev.replyhq.sdk.data.local.SdkPreferences
import platform.Foundation.NSUUID
import platform.UserNotifications.UNMutableNotificationContent
import platform.UserNotifications.UNNotificationRequest
import platform.UserNotifications.UNUserNotificationCenter

actual class PushNotificationHandler actual constructor(
    platformContext: Any?,
    private val preferences: SdkPreferences
) {
    actual fun handlePushPayload(payload: Map<String, String>, showNotification: Boolean) {
        val parsed = PushPayloadParser.parse(payload)
        if (!parsed.isMessage) return

        preferences.unreadCount = preferences.unreadCount + 1

        if (!showNotification) return

        val content = UNMutableNotificationContent()

        val request = UNNotificationRequest.requestWithIdentifier(
            identifier = parsed.messageId ?: NSUUID().UUIDString(),
            content = content,
            trigger = null
        )

        UNUserNotificationCenter.currentNotificationCenter()
            .addNotificationRequest(request, withCompletionHandler = null)
    }
}
