package dev.replyhq.sdk.data.remote

import dev.replyhq.sdk.data.local.SdkPreferences
import dev.replyhq.sdk.platform.PushNotifications
import dev.replyhq.sdk.platform.platformName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class PushTokenManager(
    private val chatApi: ChatApi,
    private val pushNotifications: PushNotifications,
    private val preferences: SdkPreferences,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
) {
    private var tokenJob: Job? = null

    fun start() {
        if (tokenJob != null) return

        registerIfNeeded(pushNotifications.getCurrentToken())

        tokenJob = scope.launch {
            pushNotifications.token.collectLatest { token ->
                registerIfNeeded(token)
            }
        }
    }

    fun stop() {
        tokenJob?.cancel()
        tokenJob = null
    }

    fun requestPermission() {
        pushNotifications.requestPermission()
    }

    fun updateToken(token: String) {
        pushNotifications.updateToken(token)
        registerIfNeeded(token)
    }

    private fun registerIfNeeded(token: String?) {
        if (token.isNullOrBlank()) return
        if (preferences.pushToken == token) return

        scope.launch {
            val result = chatApi.registerPushToken(token, platformName)
            result.onSuccess { success ->
                if (success) {
                    preferences.pushToken = token
                }
            }
        }
    }
}
