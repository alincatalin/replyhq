package dev.replyhq.sdk.platform

expect class Preferences {
    fun getString(key: String, defaultValue: String? = null): String?
    fun putString(key: String, value: String)
    
    fun getInt(key: String, defaultValue: Int = 0): Int
    fun putInt(key: String, value: Int)
    
    fun getLong(key: String, defaultValue: Long = 0L): Long
    fun putLong(key: String, value: Long)
    
    fun getBoolean(key: String, defaultValue: Boolean = false): Boolean
    fun putBoolean(key: String, value: Boolean)
    
    fun remove(key: String)
    fun clear()
}
