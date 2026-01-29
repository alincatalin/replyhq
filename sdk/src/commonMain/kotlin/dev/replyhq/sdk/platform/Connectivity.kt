package dev.replyhq.sdk.platform

import kotlinx.coroutines.flow.Flow

expect class Connectivity {
    val isConnected: Boolean
    val connectionState: Flow<Boolean>
    
    fun startMonitoring()
    fun stopMonitoring()
}
