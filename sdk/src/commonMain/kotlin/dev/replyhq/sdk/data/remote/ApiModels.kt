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
data class ApiError(
    val error: String,
    val code: String? = null,
    val message: String? = null
)
