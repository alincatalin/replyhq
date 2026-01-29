package dev.replyhq.sdk.data.remote

import dev.replyhq.sdk.config.ChatUser
import dev.replyhq.sdk.config.NetworkConfig
import dev.replyhq.sdk.data.models.Conversation
import dev.replyhq.sdk.data.models.DeviceContext
import dev.replyhq.sdk.data.models.Message
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.request
import io.ktor.http.ContentType
import io.ktor.http.appendPathSegments
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.http.takeFrom
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

class ChatApiException(
    val statusCode: Int,
    override val message: String,
    val errorCode: String? = null
) : Exception(message)

class ChatApi(
    private val appId: String,
    private val apiKey: String,
    private val deviceId: String,
    baseUrl: String = NetworkConfig.DEFAULT_BASE_URL
) {
    companion object {
        const val SDK_VERSION = "1.0.0"
        
        private const val HEADER_APP_ID = "X-App-Id"
        private const val HEADER_API_KEY = "X-Api-Key"
        private const val HEADER_DEVICE_ID = "X-Device-Id"
        private const val HEADER_SDK_VERSION = "X-SDK-Version"
    }
    
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }
    
    private val normalizedBaseUrl = normalizeBaseUrl(baseUrl)

    private val client = HttpClient {
        install(ContentNegotiation) {
            json(json)
        }
        install(Logging) {
            level = LogLevel.HEADERS
        }
        defaultRequest {
            url(normalizedBaseUrl)
            contentType(ContentType.Application.Json)
            header(HEADER_APP_ID, appId)
            header(HEADER_API_KEY, apiKey)
            header(HEADER_DEVICE_ID, deviceId)
            header(HEADER_SDK_VERSION, SDK_VERSION)
        }
    }

    private fun logDebug(message: String) {
        println("[ChatApi] $message")
    }

    init {
        if (baseUrl != normalizedBaseUrl) {
            logDebug("Normalized baseUrl from $baseUrl to $normalizedBaseUrl")
        }
        logDebug("Initialized baseUrl=$normalizedBaseUrl appId=$appId deviceId=$deviceId")
    }
    
    suspend fun createConversation(
        user: ChatUser,
        deviceContext: DeviceContext
    ): Result<Conversation> = runCatching {
        val response: HttpResponse = client.post {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("conversations")
            }
            setBody(CreateConversationRequest(user, deviceContext))
        }
        logDebug("POST ${response.request.url} -> ${response.status.value}")
        handleResponse<CreateConversationResponse>(response).conversation
    }
    
    suspend fun sendMessage(
        conversationId: String,
        localId: String,
        body: String,
        deviceContext: DeviceContext? = null
    ): Result<Message> = runCatching {
        val response: HttpResponse = client.post {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("conversations", conversationId, "messages")
            }
            setBody(SendMessageRequest(localId, body, deviceContext))
        }
        logDebug("POST ${response.request.url} -> ${response.status.value}")
        handleResponse<SendMessageResponse>(response).message
    }
    
    suspend fun fetchMessages(
        conversationId: String,
        after: Long? = null,
        limit: Int = 50
    ): Result<FetchMessagesResponse> = runCatching {
        val response: HttpResponse = client.get {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("conversations", conversationId, "messages")
                after?.let { parameters.append("after", it.toString()) }
                parameters.append("limit", limit.toString())
            }
        }
        logDebug("GET ${response.request.url} -> ${response.status.value}")
        handleResponse(response)
    }

    suspend fun syncMessages(
        conversationId: String,
        afterSequence: Long = 0,
        limit: Int = 50
    ): Result<SyncMessagesResponse> = runCatching {
        val response: HttpResponse = client.get {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("conversations", conversationId, "sync")
                parameters.append("after_sequence", afterSequence.toString())
                parameters.append("limit", limit.toString())
            }
        }
        logDebug("GET ${response.request.url} -> ${response.status.value}")
        handleResponse(response)
    }
    
    suspend fun registerPushToken(
        token: String,
        platform: String
    ): Result<Boolean> = runCatching {
        val response: HttpResponse = client.post {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("push-token")
            }
            setBody(RegisterPushTokenRequest(token, platform, deviceId))
        }
        logDebug("POST ${response.request.url} -> ${response.status.value}")
        handleResponse<RegisterPushTokenResponse>(response).success
    }

    suspend fun identifyUser(user: ChatUser): Result<Boolean> = runCatching {
        val response: HttpResponse = client.post {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("identify")
            }
            setBody(IdentifyRequest(user))
        }
        logDebug("POST ${response.request.url} -> ${response.status.value}")
        handleResponse<IdentifyResponse>(response).success
    }

    suspend fun trackEvent(
        userId: String,
        eventName: String,
        properties: Map<String, String>? = null,
        userPlan: String? = null,
        userCountry: String? = null,
        sessionId: String? = null,
        platform: String? = null,
        appVersion: String? = null
    ): Result<Boolean> = runCatching {
        val response: HttpResponse = client.post {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("events", "track")
            }
            setBody(
                TrackEventRequest(
                    userId = userId,
                    eventName = eventName,
                    properties = properties,
                    userPlan = userPlan,
                    userCountry = userCountry,
                    sessionId = sessionId,
                    platform = platform,
                    appVersion = appVersion
                )
            )
        }
        logDebug("POST ${response.request.url} -> ${response.status.value}")
        handleResponse<TrackEventResponse>(response).success
    }

    suspend fun markDelivered(
        conversationId: String,
        messageIds: List<String>
    ): Result<Boolean> = runCatching {
        val response: HttpResponse = client.post {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("conversations", conversationId, "messages", "delivered")
            }
            setBody(MarkDeliveredRequest(messageIds))
        }
        logDebug("POST ${response.request.url} -> ${response.status.value}")
        handleResponse<MessageStatusUpdateResponse>(response).updates.isNotEmpty()
    }

    suspend fun markRead(
        conversationId: String,
        upToMessageId: String? = null
    ): Result<Boolean> = runCatching {
        val response: HttpResponse = client.post {
            url {
                takeFrom(normalizedBaseUrl)
                appendPathSegments("conversations", conversationId, "messages", "read")
            }
            setBody(MarkReadRequest(upToMessageId))
        }
        logDebug("POST ${response.request.url} -> ${response.status.value}")
        handleResponse<MessageStatusUpdateResponse>(response).updates.isNotEmpty()
    }
    
    private suspend inline fun <reified T> handleResponse(response: HttpResponse): T {
        if (response.status.isSuccess()) {
            return response.body()
        }

        val errorBody = try {
            response.body<ApiError>()
        } catch (e: Exception) {
            null
        }
        logDebug("Error ${response.status.value} at ${response.request.url} body=${errorBody?.error ?: errorBody?.message}")
        
        throw ChatApiException(
            statusCode = response.status.value,
            message = errorBody?.message ?: errorBody?.error ?: "Request failed with status ${response.status.value}",
            errorCode = errorBody?.code
        )
    }
    
    fun close() {
        client.close()
    }

    private fun normalizeBaseUrl(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) {
            return trimmed
        }
        val withoutTrailingSlash = trimmed.removeSuffix("/")
        if (withoutTrailingSlash.endsWith("/v1")) {
            return withoutTrailingSlash
        }
        return "$withoutTrailingSlash/v1"
    }
}
