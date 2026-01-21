package dev.replyhq.sdk.platform

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import platform.Network.nw_path_get_status
import platform.Network.nw_path_monitor_create
import platform.Network.nw_path_monitor_set_queue
import platform.Network.nw_path_monitor_set_update_handler
import platform.Network.nw_path_monitor_start
import platform.Network.nw_path_monitor_cancel
import platform.Network.nw_path_status_satisfied
import platform.darwin.dispatch_get_main_queue

actual class Connectivity {
    private val _connectionState = MutableStateFlow(true)
    private var pathMonitor = nw_path_monitor_create()
    
    actual val isConnected: Boolean
        get() = _connectionState.value
    
    actual val connectionState: Flow<Boolean>
        get() = _connectionState.asStateFlow()
    
    actual fun startMonitoring() {
        pathMonitor = nw_path_monitor_create()
        
        nw_path_monitor_set_update_handler(pathMonitor) { path ->
            val status = nw_path_get_status(path)
            _connectionState.value = status == nw_path_status_satisfied
        }
        
        nw_path_monitor_set_queue(pathMonitor, dispatch_get_main_queue())
        nw_path_monitor_start(pathMonitor)
    }
    
    actual fun stopMonitoring() {
        nw_path_monitor_cancel(pathMonitor)
    }
}
