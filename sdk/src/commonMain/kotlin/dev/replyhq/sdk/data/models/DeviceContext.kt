package dev.replyhq.sdk.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DeviceContext(
    val platform: String,
    @SerialName("os_version")
    val osVersion: String,
    @SerialName("app_version")
    val appVersion: String,
    @SerialName("device_model")
    val deviceModel: String,
    val locale: String,
    val timezone: String,
    @SerialName("sdk_version")
    val sdkVersion: String = "1.0.0"
)
