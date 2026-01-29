package dev.replyhq.sdk.data.local

import dev.replyhq.sdk.platform.Preferences

class SdkPreferences(
    private val preferences: Preferences
) {
    companion object {
        private const val KEY_DEVICE_ID = "replyhq_device_id"
        private const val KEY_CURRENT_CONVERSATION_ID = "replyhq_current_conversation_id"
        private const val KEY_USER_ID = "replyhq_user_id"
        private const val KEY_PUSH_TOKEN = "replyhq_push_token"
        private const val KEY_LAST_SYNC_TIMESTAMP = "replyhq_last_sync_timestamp"
        private const val KEY_LAST_SYNC_SEQUENCE = "replyhq_last_sync_sequence"
        private const val KEY_UNREAD_COUNT = "replyhq_unread_count"
    }

    var deviceId: String?
        get() = preferences.getString(KEY_DEVICE_ID)
        set(value) = if (value != null) preferences.putString(KEY_DEVICE_ID, value) else preferences.remove(KEY_DEVICE_ID)

    var currentConversationId: String?
        get() = preferences.getString(KEY_CURRENT_CONVERSATION_ID)
        set(value) = if (value != null) preferences.putString(KEY_CURRENT_CONVERSATION_ID, value) else preferences.remove(KEY_CURRENT_CONVERSATION_ID)

    var userId: String?
        get() = preferences.getString(KEY_USER_ID)
        set(value) = if (value != null) preferences.putString(KEY_USER_ID, value) else preferences.remove(KEY_USER_ID)

    var pushToken: String?
        get() = preferences.getString(KEY_PUSH_TOKEN)
        set(value) = if (value != null) preferences.putString(KEY_PUSH_TOKEN, value) else preferences.remove(KEY_PUSH_TOKEN)

    var lastSyncTimestamp: Long
        get() = preferences.getLong(KEY_LAST_SYNC_TIMESTAMP)
        set(value) = preferences.putLong(KEY_LAST_SYNC_TIMESTAMP, value)

    var lastSyncSequence: Long
        get() = preferences.getLong(KEY_LAST_SYNC_SEQUENCE)
        set(value) = preferences.putLong(KEY_LAST_SYNC_SEQUENCE, value)

    var unreadCount: Int
        get() = preferences.getInt(KEY_UNREAD_COUNT)
        set(value) = preferences.putInt(KEY_UNREAD_COUNT, value)

    fun clear() {
        preferences.remove(KEY_CURRENT_CONVERSATION_ID)
        preferences.remove(KEY_USER_ID)
        preferences.remove(KEY_PUSH_TOKEN)
        preferences.remove(KEY_LAST_SYNC_TIMESTAMP)
        preferences.remove(KEY_LAST_SYNC_SEQUENCE)
        preferences.remove(KEY_UNREAD_COUNT)
    }

    fun clearAll() {
        clear()
        preferences.remove(KEY_DEVICE_ID)
    }
}
