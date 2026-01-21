package dev.replyhq.sdk.platform

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import platform.UserNotifications.UNAuthorizationOptionAlert
import platform.UserNotifications.UNAuthorizationOptionBadge
import platform.UserNotifications.UNAuthorizationOptionSound
import platform.UserNotifications.UNUserNotificationCenter

actual class PushNotifications {
    private val _token = MutableStateFlow<String?>(null)
    
    actual val token: Flow<String?>
        get() = _token.asStateFlow()
    
    actual fun requestPermission() {
        val center = UNUserNotificationCenter.currentNotificationCenter()
        val options = UNAuthorizationOptionAlert or UNAuthorizationOptionSound or UNAuthorizationOptionBadge
        center.requestAuthorizationWithOptions(options) { granted, error ->
            if (granted) {
                // Permission granted, APNs token will be provided via delegate
            }
        }
    }
    
    actual fun getCurrentToken(): String? {
        return _token.value
    }
    
    fun updateToken(newToken: String) {
        _token.value = newToken
    }
}
