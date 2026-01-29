package dev.replyhq.sdk.config

import kotlinx.serialization.Serializable

@Serializable
data class ChatUser(
    val id: String,
    val name: String? = null,
    val email: String? = null,
    val attributes: Map<String, String> = emptyMap()
)
