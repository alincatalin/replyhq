package dev.replyhq.sdk.platform

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

actual class PushNotifications {
    companion object {
        private val sharedToken = MutableStateFlow<String?>(null)
    }

    actual val token: Flow<String?>
        get() = sharedToken.asStateFlow()
    
    actual fun requestPermission() {
        // On Android 13+, POST_NOTIFICATIONS permission is required
        // This is typically handled by the host app
        // FCM token is retrieved automatically
    }
    
    actual fun getCurrentToken(): String? {
        return sharedToken.value
    }
    
    actual fun updateToken(newToken: String) {
        sharedToken.value = newToken
    }
}
