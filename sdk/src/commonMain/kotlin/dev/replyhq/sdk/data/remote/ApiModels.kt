package dev.replyhq.sdk.data.remote

import dev.replyhq.sdk.config.ChatUser
import dev.replyhq.sdk.data.models.DeviceContext
import dev.replyhq.sdk.data.models.Message
import dev.replyhq.sdk.data.models.Conversation
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CreateConversationRequest(
    val user: ChatUser,
    @SerialName("device_context")
    val deviceContext: DeviceContext
)

@Serializable
data class CreateConversationResponse(
    val conversation: Conversation
)

@Serializable
data class SendMessageRequest(
    @SerialName("local_id")
    val localId: String,
    val body: String,
    @SerialName("device_context")
    val deviceContext: DeviceContext? = null
)

@Serializable
data class SendMessageResponse(
    val message: Message
)

@Serializable
data class FetchMessagesResponse(
    val messages: List<Message>,
    @SerialName("has_more")
    val hasMore: Boolean = false
)

@Serializable
data class SyncMessagesResponse(
    val messages: List<Message>,
    @SerialName("last_sequence")
    val lastSequence: Long,
    @SerialName("has_more")
    val hasMore: Boolean
)

@Serializable
data class RegisterPushTokenRequest(
    val token: String,
    val platform: String,
    @SerialName("device_id")
    val deviceId: String
)

@Serializable
data class RegisterPushTokenResponse(
    val success: Boolean
)

@Serializable
data class IdentifyRequest(
    val user: ChatUser
)

@Serializable
data class IdentifyResponse(
    val success: Boolean
)

@Serializable
data class TrackEventRequest(
    @SerialName("user_id")
    val userId: String,
    @SerialName("event_name")
    val eventName: String,
    val properties: Map<String, String>? = null,
    @SerialName("user_plan")
    val userPlan: String? = null,
    @SerialName("user_country")
    val userCountry: String? = null,
    @SerialName("session_id")
    val sessionId: String? = null,
    val platform: String? = null,
    @SerialName("app_version")
    val appVersion: String? = null
)

@Serializable
data class TrackEventResponse(
    val success: Boolean
)

@Serializable
data class MarkDeliveredRequest(
    @SerialName("message_ids")
    val messageIds: List<String>
)

@Serializable
data class MarkReadRequest(
    @SerialName("up_to_message_id")
    val upToMessageId: String? = null
)

@Serializable
data class MessageStatusUpdateResponse(
    val updates: List<MessageStatusUpdate>
)

@Serializable
data class MessageStatusUpdate(
    val id: String,
    val status: String
)

@Serializable
data class ApiError(
    val error: String,
    val code: String? = null,
    val message: String? = null
)
