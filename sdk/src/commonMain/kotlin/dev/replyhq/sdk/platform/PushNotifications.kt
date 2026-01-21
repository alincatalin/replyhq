package dev.replyhq.sdk.platform

import kotlinx.coroutines.flow.Flow

expect class PushNotifications {
    val token: Flow<String?>
    
    fun requestPermission()
    fun getCurrentToken(): String?
}
