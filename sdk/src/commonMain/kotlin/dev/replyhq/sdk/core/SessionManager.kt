package dev.replyhq.sdk.core

import dev.replyhq.sdk.config.ChatUser
import dev.replyhq.sdk.data.local.SdkPreferences
import dev.replyhq.sdk.data.models.Conversation
import dev.replyhq.sdk.data.models.DeviceContext
import dev.replyhq.sdk.data.remote.ChatApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

class SessionManager(
    private val preferences: SdkPreferences,
    private val chatApi: ChatApi,
    private val deviceContextCollector: DeviceContextCollector,
    private val connectionManager: ConnectionManager
) {
    private val _currentUser = MutableStateFlow<ChatUser?>(null)
    val currentUser: StateFlow<ChatUser?> = _currentUser.asStateFlow()
    
    private val _currentConversation = MutableStateFlow<Conversation?>(null)
    val currentConversation: StateFlow<Conversation?> = _currentConversation.asStateFlow()
    
    private val _isActive = MutableStateFlow(false)
    val isActive: StateFlow<Boolean> = _isActive.asStateFlow()
    
    val deviceId: String
        get() = getOrCreateDeviceId()
    
    @OptIn(ExperimentalUuidApi::class)
    private fun getOrCreateDeviceId(): String {
        var id = preferences.deviceId
        if (id == null) {
            id = Uuid.random().toString()
            preferences.deviceId = id
        }
        return id
    }
    
    suspend fun setUser(user: ChatUser): Result<Conversation> {
        println("[SessionManager] setUser() called with user: ${user.id}")
        val previousUserId = preferences.userId

        if (previousUserId != null && previousUserId != user.id) {
            endSession()
        }

        _currentUser.value = user
        preferences.userId = user.id

        return startOrContinueConversation(user)
    }
    
    suspend fun clearUser() {
        endSession()
        _currentUser.value = null
        preferences.userId = null
        preferences.currentConversationId = null
    }
    
    fun onAppForegrounded() {
        if (_currentUser.value != null) {
            connectionManager.resume()
            _isActive.value = true
        }
    }
    
    fun onAppBackgrounded() {
        connectionManager.pause()
        _isActive.value = false
    }
    
    private suspend fun startOrContinueConversation(user: ChatUser): Result<Conversation> {
        val existingConversationId = preferences.currentConversationId
        
        if (existingConversationId != null && preferences.userId == user.id) {
            _currentConversation.value?.let {
                connectionManager.setActiveConversation(it.id)
                connectionManager.connect()
                _isActive.value = true
                return Result.success(it)
            }
        }
        
        val deviceContext = deviceContextCollector.collect()
        val result = chatApi.createConversation(user, deviceContext)
        
        return result.onSuccess { conversation ->
            preferences.currentConversationId = conversation.id
            _currentConversation.value = conversation
            connectionManager.setActiveConversation(conversation.id)
            connectionManager.connect()
            _isActive.value = true
        }
    }
    
    private fun endSession() {
        connectionManager.disconnect()
        connectionManager.setActiveConversation(null)
        _currentConversation.value = null
        _isActive.value = false
    }
    
    fun getDeviceContext(): DeviceContext {
        return deviceContextCollector.collect()
    }
    
    fun reset() {
        endSession()
        _currentUser.value = null
        preferences.clearAll()
    }
}
