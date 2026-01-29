package dev.replyhq.sdk.core

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dev.replyhq.sdk.data.models.DeviceContext
import java.util.Locale
import java.util.TimeZone

actual class DeviceContextCollector(
    private val context: Context
) {
    actual fun collect(): DeviceContext {
        val packageInfo = try {
            context.packageManager.getPackageInfo(context.packageName, 0)
        } catch (e: PackageManager.NameNotFoundException) {
            null
        }
        
        val appVersion = packageInfo?.versionName ?: "unknown"
        
        return DeviceContext(
            platform = "android",
            osVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            appVersion = appVersion,
            deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}",
            locale = Locale.getDefault().toLanguageTag(),
            timezone = TimeZone.getDefault().id
        )
    }
}
