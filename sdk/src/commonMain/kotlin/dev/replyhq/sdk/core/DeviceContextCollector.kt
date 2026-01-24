package dev.replyhq.sdk.core

import dev.replyhq.sdk.data.models.DeviceContext

expect class DeviceContextCollector {
    fun collect(): DeviceContext
}
