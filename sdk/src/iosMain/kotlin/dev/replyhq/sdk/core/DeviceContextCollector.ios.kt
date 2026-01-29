package dev.replyhq.sdk.core

import dev.replyhq.sdk.data.models.DeviceContext
import platform.Foundation.NSBundle
import platform.Foundation.NSLocale
import platform.Foundation.NSTimeZone
import platform.Foundation.currentLocale
import platform.Foundation.localTimeZone
import platform.Foundation.localeIdentifier
import platform.UIKit.UIDevice

actual class DeviceContextCollector {
    actual fun collect(): DeviceContext {
        val device = UIDevice.currentDevice
        val bundle = NSBundle.mainBundle
        
        val appVersion = bundle.objectForInfoDictionaryKey("CFBundleShortVersionString")?.toString() ?: "unknown"
        
        return DeviceContext(
            platform = "ios",
            osVersion = "iOS ${device.systemVersion}",
            appVersion = appVersion,
            deviceModel = device.model,
            locale = NSLocale.currentLocale.localeIdentifier,
            timezone = NSTimeZone.localTimeZone.name
        )
    }
}
