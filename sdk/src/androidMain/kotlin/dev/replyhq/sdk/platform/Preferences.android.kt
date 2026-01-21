package dev.replyhq.sdk.platform

import android.content.Context
import android.content.SharedPreferences

actual class Preferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE
    )
    
    actual fun getString(key: String, defaultValue: String?): String? {
        return prefs.getString(key, defaultValue)
    }
    
    actual fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }
    
    actual fun getInt(key: String, defaultValue: Int): Int {
        return prefs.getInt(key, defaultValue)
    }
    
    actual fun putInt(key: String, value: Int) {
        prefs.edit().putInt(key, value).apply()
    }
    
    actual fun getLong(key: String, defaultValue: Long): Long {
        return prefs.getLong(key, defaultValue)
    }
    
    actual fun putLong(key: String, value: Long) {
        prefs.edit().putLong(key, value).apply()
    }
    
    actual fun getBoolean(key: String, defaultValue: Boolean): Boolean {
        return prefs.getBoolean(key, defaultValue)
    }
    
    actual fun putBoolean(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }
    
    actual fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }
    
    actual fun clear() {
        prefs.edit().clear().apply()
    }
    
    companion object {
        private const val PREFS_NAME = "replyhq_sdk_prefs"
    }
}
