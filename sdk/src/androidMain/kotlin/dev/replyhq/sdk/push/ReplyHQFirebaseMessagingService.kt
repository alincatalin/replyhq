package dev.replyhq.sdk.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dev.replyhq.sdk.ChatSDK

class ReplyHQFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        ChatSDK.updatePushToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val payload = mutableMapOf<String, String>()

        if (message.data.isNotEmpty()) {
            payload.putAll(message.data)
        }

        message.notification?.title?.let { payload["title"] = it }
        message.notification?.body?.let { payload["body"] = it }

        val shouldShowNotification = message.notification == null
        ChatSDK.handlePushNotification(payload, showNotification = shouldShowNotification)
    }
}
