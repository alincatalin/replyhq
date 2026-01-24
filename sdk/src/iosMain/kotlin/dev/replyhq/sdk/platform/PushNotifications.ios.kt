package dev.replyhq.sdk.platform

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import platform.UserNotifications.UNAuthorizationOptionAlert
import platform.UserNotifications.UNAuthorizationOptionBadge
import platform.UserNotifications.UNAuthorizationOptionSound
import platform.UserNotifications.UNUserNotificationCenter
import platform.UIKit.UIApplication

actual class PushNotifications {
    companion object {
        private val sharedToken = MutableStateFlow<String?>(null)
    }

    actual val token: Flow<String?>
        get() = sharedToken.asStateFlow()
    
    actual fun requestPermission() {
        val center = UNUserNotificationCenter.currentNotificationCenter()
        val options = UNAuthorizationOptionAlert or UNAuthorizationOptionSound or UNAuthorizationOptionBadge
        center.requestAuthorizationWithOptions(options) { granted, error ->
            if (granted) {
                UIApplication.sharedApplication.registerForRemoteNotifications()
            }
        }
    }
    
    actual fun getCurrentToken(): String? {
        return sharedToken.value
    }
    
    actual fun updateToken(newToken: String) {
        sharedToken.value = newToken
    }
}
