package dev.replyhq.sdk

import android.content.Context
import dev.replyhq.sdk.config.ChatConfig
import dev.replyhq.sdk.core.ConnectionManager
import dev.replyhq.sdk.core.DeviceContextCollector
import dev.replyhq.sdk.core.SessionManager
import dev.replyhq.sdk.core.SyncManager
import dev.replyhq.sdk.data.local.ChatDatabaseWrapper
import dev.replyhq.sdk.data.local.DatabaseDriverFactory
import dev.replyhq.sdk.data.local.MessageQueue
import dev.replyhq.sdk.data.local.SdkPreferences
import dev.replyhq.sdk.data.remote.ChatApi
import dev.replyhq.sdk.data.remote.PushNotificationHandler
import dev.replyhq.sdk.data.remote.PushTokenManager
import dev.replyhq.sdk.data.remote.SocketIOClient
import dev.replyhq.sdk.platform.Connectivity
import dev.replyhq.sdk.platform.Preferences
import dev.replyhq.sdk.platform.PushNotifications

actual class ChatSDKInitializer private constructor(
    private val context: Context,
    actual val config: ChatConfig
) {
    actual val appId: String = config.appId
    
    private val preferences = Preferences(context)
    private val sdkPreferences = SdkPreferences(preferences)
    private val connectivity = Connectivity(context)
    private val databaseWrapper = ChatDatabaseWrapper(DatabaseDriverFactory(context))
    private val messageQueue = MessageQueue(databaseWrapper)
    private val deviceContextCollector = DeviceContextCollector(context)
    private val pushNotifications = PushNotifications()
    
    private val deviceId: String
        get() {
            var id = sdkPreferences.deviceId
            if (id == null) {
                id = java.util.UUID.randomUUID().toString()
                sdkPreferences.deviceId = id
            }
            return id
        }
    
    private val chatApi = ChatApi(appId, config.apiKey, deviceId, config.network.baseUrl)
    private val socketIOClient = SocketIOClient(appId, config.apiKey, deviceId, config.network.websocketUrl)
    private val connectionManager = ConnectionManager(socketIOClient, connectivity)
    
    actual fun createConnectionManager(): ConnectionManager {
        return connectionManager
    }
    
    actual fun createSessionManager(): SessionManager {
        return SessionManager(
            preferences = sdkPreferences,
            chatApi = chatApi,
            deviceContextCollector = deviceContextCollector,
            connectionManager = connectionManager
        )
    }
    
    actual fun createSyncManager(connectionManager: ConnectionManager): SyncManager {
        return SyncManager(
            chatApi = chatApi,
            messageQueue = messageQueue,
            database = databaseWrapper,
            preferences = sdkPreferences,
            connectionManager = connectionManager
        )
    }

    actual fun createPushTokenManager(): PushTokenManager {
        return PushTokenManager(
            chatApi = chatApi,
            pushNotifications = pushNotifications,
            preferences = sdkPreferences
        )
    }

    actual fun createPushNotificationHandler(): PushNotificationHandler {
        return PushNotificationHandler(
            platformContext = context,
            preferences = sdkPreferences
        )
    }
    
    companion object {
        fun create(context: Context, appId: String, apiKey: String): ChatSDKInitializer {
            val config = ChatConfig(appId = appId, apiKey = apiKey)
            return ChatSDKInitializer(context.applicationContext, config)
        }
        
        fun create(context: Context, config: ChatConfig): ChatSDKInitializer {
            return ChatSDKInitializer(context.applicationContext, config)
        }
    }
}
