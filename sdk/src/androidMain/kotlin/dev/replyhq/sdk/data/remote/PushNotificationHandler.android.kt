package dev.replyhq.sdk.data.remote

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import dev.replyhq.sdk.data.local.SdkPreferences
import kotlin.random.Random

actual class PushNotificationHandler actual constructor(
    platformContext: Any?,
    private val preferences: SdkPreferences
) {
    companion object {
        private const val CHANNEL_ID = "replyhq_messages"
        private const val CHANNEL_NAME = "ReplyHQ Messages"
        private const val EXTRA_OPEN_CHAT = "replyhq_open_chat"
    }

    private val context: Context = (platformContext as? Context)
        ?: error("Android Context is required for PushNotificationHandler.")

    private val notificationManager: NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    actual fun handlePushPayload(payload: Map<String, String>, showNotification: Boolean) {
        val parsed = PushPayloadParser.parse(payload)
        if (!parsed.isMessage) return

        preferences.unreadCount = preferences.unreadCount + 1

        if (!showNotification) return

        ensureChannel()

        val title = parsed.title ?: "New message"
        val body = parsed.body ?: "You have a new message"
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        launchIntent?.putExtra(EXTRA_OPEN_CHAT, true)
        val pendingIntent = launchIntent?.let {
            PendingIntent.getActivity(
                context,
                0,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val notification = Notification.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        val notificationId = parsed.messageId?.hashCode() ?: Random.nextInt()
        notificationManager.notify(notificationId, notification)
    }

    private fun ensureChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT
        )
        notificationManager.createNotificationChannel(channel)
    }
}
