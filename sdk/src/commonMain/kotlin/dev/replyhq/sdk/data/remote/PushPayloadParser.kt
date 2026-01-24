package dev.replyhq.sdk.data.remote

data class PushNotificationPayload(
    val title: String?,
    val body: String?,
    val conversationId: String?,
    val messageId: String?,
    val senderType: String?
) {
    val isMessage: Boolean
        get() = messageId != null || conversationId != null || senderType != null || body != null
}

object PushPayloadParser {
    fun parse(payload: Map<String, String>): PushNotificationPayload {
        val title = payload["title"]
            ?: payload["notification_title"]
            ?: payload["aps.alert.title"]
        val body = payload["body"]
            ?: payload["message"]
            ?: payload["alert"]
            ?: payload["text"]
            ?: payload["aps.alert.body"]
        val conversationId = payload["conversation_id"]
            ?: payload["conversationId"]
        val messageId = payload["message_id"]
            ?: payload["messageId"]
        val senderType = payload["sender_type"]
            ?: payload["senderType"]

        return PushNotificationPayload(
            title = title,
            body = body,
            conversationId = conversationId,
            messageId = messageId,
            senderType = senderType
        )
    }
}
