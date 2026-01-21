# ReplyHQ SDK - Technical Product Requirements Document

**Version:** 1.0.0  
**Last Updated:** January 21, 2026  
**Status:** Draft  

---

## 1. Executive Summary

ReplyHQ SDK is a Kotlin Multiplatform (KMP) library that enables mobile developers to integrate in-app customer support chat into their Android and iOS applications with minimal effort. The SDK provides a drop-in chat UI, offline support, real-time messaging, and push notifications.

**Core Principle:** If integration is painful, nobody uses it. The SDK must be dead simple to integrate.

---

## 2. Goals & Success Metrics

### Primary Goals
- **5-minute integration:** Developer goes from zero to working chat in under 5 minutes
- **Cross-platform consistency:** Identical API and behavior on Android and iOS
- **Offline-first:** Messages never lost, even with intermittent connectivity
- **Production-ready:** Handle all edge cases gracefully

### Success Metrics
| Metric | Target |
|--------|--------|
| Integration time (minimal setup) | < 5 minutes |
| SDK size (Android AAR) | < 2 MB |
| SDK size (iOS framework) | < 3 MB |
| Cold start overhead | < 50ms |
| Memory footprint (idle) | < 10 MB |
| Crash-free rate | > 99.9% |

---

## 3. Target Platforms

### Android
- **Minimum SDK:** 28 (Android 9.0)
- **Target SDK:** 36
- **UI Framework:** Jetpack Compose
- **Distribution:** Maven Central / GitHub Packages

### iOS
- **Minimum Version:** iOS 15.0
- **Architecture:** arm64, x86_64 (simulator)
- **UI Framework:** SwiftUI wrapper over Compose Multiplatform
- **Distribution:** XCFramework via Swift Package Manager / CocoaPods

---

## 4. SDK Architecture

### 4.1 Module Structure

```
dev.replyhq.sdk/
├── ChatSDK.kt                    # Main entry point (singleton)
├── config/
│   ├── ChatConfig.kt             # Full configuration container
│   ├── ChatUser.kt               # User identification
│   ├── ChatTheme.kt              # Appearance customization
│   ├── ChatBehavior.kt           # Runtime behavior settings
│   └── NetworkConfig.kt          # Timeout, retry policies
├── ui/
│   ├── ChatBubble.kt             # Floating action button
│   ├── ChatScreen.kt             # Full chat interface
│   ├── components/
│   │   ├── MessageList.kt        # Scrollable message list
│   │   ├── MessageBubble.kt      # Individual message rendering
│   │   ├── InputBar.kt           # Text input + send button
│   │   ├── TypingIndicator.kt    # Agent typing animation
│   │   └── ConnectionStatus.kt   # Online/offline indicator
│   └── theme/
│       └── ChatTheme.kt          # Theming system
├── data/
│   ├── models/
│   │   ├── Conversation.kt       # Conversation entity
│   │   ├── Message.kt            # Message entity
│   │   └── DeviceContext.kt      # Device metadata
│   ├── local/
│   │   ├── ChatDatabase.kt       # SQLDelight persistence
│   │   ├── MessageQueue.kt       # Offline message queue
│   │   └── Preferences.kt        # SDK state storage
│   └── remote/
│       ├── ChatApi.kt            # REST API client
│       ├── RealtimeClient.kt     # WebSocket handler
│       └── PushTokenManager.kt   # FCM/APNs registration
├── core/
│   ├── ConnectionManager.kt      # Network state machine
│   ├── SyncManager.kt            # Offline sync logic
│   ├── DeviceContextCollector.kt # Platform info gathering
│   └── SessionManager.kt         # Session lifecycle
└── platform/                     # expect/actual declarations
    ├── Platform.kt               # OS detection
    ├── PushNotifications.kt      # FCM (Android) / APNs (iOS)
    └── Connectivity.kt           # Network monitoring
```

### 4.2 Layer Responsibilities

| Layer | Responsibility | Key Dependencies |
|-------|---------------|------------------|
| **UI** | Compose-based chat interface | Compose Multiplatform |
| **Core** | Connection, sync, session management | Coroutines, Flow |
| **Data** | Persistence, networking, caching | SQLDelight, Ktor |
| **Platform** | OS-specific implementations | expect/actual |

---

## 5. Public API Specification

### 5.1 Initialization

```kotlin
// Minimal init (90% of users)
ChatSDK.init(
    context = applicationContext,  // Android only
    appId = "app_xxxxxxxxxxxxx"
)

// Full configuration
ChatSDK.init(
    context = applicationContext,
    config = ChatConfig(
        appId = "app_xxxxxxxxxxxxx",
        user = ChatUser(...),
        theme = ChatTheme(...),
        behavior = ChatBehavior(...),
        network = NetworkConfig(...),
        logging = LogLevel.ERROR
    )
)
```

### 5.2 User Management

```kotlin
// Identify user (call after login)
ChatSDK.setUser(
    ChatUser(
        id = "user_123",
        name = "Jane Doe",           // optional
        email = "jane@example.com",  // optional
        attributes = mapOf(          // optional custom data
            "plan" to "pro",
            "signup_date" to "2024-01-15"
        )
    )
)

// Clear user (call on logout)
ChatSDK.clearUser()
```

### 5.3 UI Components

```kotlin
// Floating chat bubble (Composable)
@Composable
fun ChatBubble(
    modifier: Modifier = Modifier
)

// Full chat screen (Composable)
@Composable
fun ChatScreen(
    onDismiss: () -> Unit
)
```

### 5.4 Programmatic Control

```kotlin
ChatSDK.open()                      // Open chat programmatically
ChatSDK.close()                     // Close chat
ChatSDK.unreadCount: StateFlow<Int> // Observe unread count

// Lifecycle (auto-detected, but can override)
ChatSDK.onAppForegrounded()
ChatSDK.onAppBackgrounded()

// Debug
ChatSDK.reset()                     // Clear all local data
```

---

## 6. Configuration Objects

### 6.1 ChatUser

```kotlin
data class ChatUser(
    val id: String,                    // Internal user ID
    val name: String? = null,          // Display name
    val email: String? = null,         // Email address
    val attributes: Map<String, Any>? = null  // Custom metadata
)
```

### 6.2 ChatTheme

```kotlin
data class ChatTheme(
    val accentColor: Color = Color(0xFF6366F1),
    val bubblePosition: BubblePosition = BubblePosition.BOTTOM_RIGHT,
    val darkMode: DarkMode = DarkMode.SYSTEM
)

enum class BubblePosition {
    BOTTOM_LEFT, BOTTOM_RIGHT
}

enum class DarkMode {
    LIGHT, DARK, SYSTEM
}
```

### 6.3 ChatBehavior

```kotlin
data class ChatBehavior(
    val showBubble: Boolean = true,
    val enableOfflineQueue: Boolean = true,
    val maxOfflineMessages: Int = 50,
    val attachmentsEnabled: Boolean = false,  // MVP: disabled
    val typingIndicators: Boolean = true
)
```

### 6.4 NetworkConfig

```kotlin
data class NetworkConfig(
    val timeout: Duration = 30.seconds,
    val retryPolicy: RetryPolicy = RetryPolicy.EXPONENTIAL,
    val maxRetries: Int = 3
)

enum class RetryPolicy {
    EXPONENTIAL, LINEAR, NONE
}
```

---

## 7. Data Models

### 7.1 Conversation

```kotlin
data class Conversation(
    val id: String,
    val status: ConversationStatus,
    val createdAt: Instant,
    val updatedAt: Instant,
    val unreadCount: Int
)

enum class ConversationStatus {
    OPEN, RESOLVED
}
```

### 7.2 Message

```kotlin
data class Message(
    val id: String?,                // Server ID (null if pending)
    val localId: String,            // Client-generated UUID
    val conversationId: String,
    val sender: Sender,
    val body: String,
    val createdAt: Instant,
    val state: MessageState
)

enum class Sender {
    USER, AGENT
}

enum class MessageState {
    QUEUED,    // Waiting to send
    SENDING,   // In flight
    SENT,      // Confirmed by server
    FAILED     // Max retries exceeded
}
```

### 7.3 DeviceContext

```kotlin
data class DeviceContext(
    val platform: String,      // "android" | "ios"
    val osVersion: String,     // "14.0"
    val appVersion: String,    // From BuildConfig
    val deviceModel: String,   // "Pixel 7"
    val locale: String,        // "en_US"
    val timezone: String,      // "America/New_York"
    val sdkVersion: String     // "1.0.0"
)
```

---

## 8. Connection Management

### 8.1 Connection States

```kotlin
enum class ConnectionState {
    CONNECTED,      // WebSocket open, realtime working
    CONNECTING,     // Attempting connection
    DISCONNECTED,   // No connection, will retry
    OFFLINE         // Device has no network
}
```

### 8.2 Connection Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        SDK LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  App Launch                                                     │
│  └─→ SDK initialized (no connection yet)                       │
│                                                                 │
│  User opens chat                                                │
│  └─→ ConnectionManager.connect()                                │
│      ├─→ Fetch conversation history (REST)                     │
│      └─→ Open WebSocket for realtime                           │
│                                                                 │
│  App backgrounded                                               │
│  └─→ ConnectionManager.pause()                                  │
│      ├─→ Close WebSocket (save battery)                        │
│      └─→ Push notifications take over                          │
│                                                                 │
│  App foregrounded (chat still open)                            │
│  └─→ ConnectionManager.resume()                                 │
│      ├─→ Reconnect WebSocket                                   │
│      └─→ Sync any missed messages                              │
│                                                                 │
│  User closes chat                                               │
│  └─→ ConnectionManager.disconnect()                             │
│      └─→ WebSocket closed                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Reconnection Strategy

- Exponential backoff: 1s → 2s → 4s → 8s → ... → 30s (max)
- Heartbeat ping every 30s to detect dead connections
- On reconnect: sync all missed messages from server

---

## 9. Offline Support

### 9.1 Message Queue Flow

```
User sends message while offline
│
├── Generate localId (UUID)
├── Save to local DB with state = QUEUED
├── Show in UI immediately (optimistic)
└── UI shows "sending" indicator

Network restored
│
├── SyncManager detects connectivity
├── Fetch queued messages (oldest first)
├── For each message:
│   ├── Set state = SENDING
│   ├── POST to server
│   ├── Success?
│   │   ├── Server returns serverId + timestamp
│   │   ├── Update local record with serverId
│   │   ├── Set state = SENT
│   │   └── Update UI (remove "sending" indicator)
│   └── Failure?
│       ├── Increment retryCount
│       ├── retryCount < 3? → Retry with backoff
│       └── retryCount >= 3? → Set state = FAILED
│
└── Failed messages show "tap to retry" in UI
```

### 9.2 Conflict Resolution

Server timestamp is source of truth. Messages sorted by server-assigned timestamp, not local time.

---

## 10. API Contract

### 10.1 Base Configuration

```
Base URL: https://api.replyhq.dev/v1

Headers (all requests):
  X-App-Id: app_xxxxxxxxxxxxx
  X-Device-Id: <generated on first launch, persisted>
  X-SDK-Version: 1.0.0
  Content-Type: application/json
```

### 10.2 REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/conversations` | Get or create conversation |
| POST | `/conversations/:id/messages` | Send a message |
| GET | `/conversations/:id/messages?after=<ts>` | Fetch messages after timestamp |
| POST | `/push-token` | Register push notification token |

### 10.3 WebSocket

```
URL: wss://api.replyhq.dev/v1/realtime?app_id=xxx&device_id=xxx

Server → Client:
  { "type": "message.new", "data": { "message": {...} } }
  { "type": "agent.typing", "data": { "conversation_id": "conv_xxx" } }

Client → Server:
  { "type": "user.typing", "data": { "conversation_id": "conv_xxx" } }
  { "type": "ping" }
```

---

## 11. Platform-Specific Implementation

### 11.1 expect/actual Declarations

| Component | Android | iOS |
|-----------|---------|-----|
| `Platform.name` | `"android"` | `"ios"` |
| `Connectivity` | `ConnectivityManager` | `NWPathMonitor` |
| `PushNotifications` | Firebase Cloud Messaging | Apple Push Notification Service |
| `Preferences` | `SharedPreferences` | `NSUserDefaults` |

### 11.2 iOS Integration

The SDK exposes an XCFramework (`sdkKit`) that can be consumed via:
- Swift Package Manager
- CocoaPods
- Direct XCFramework embedding

SwiftUI wrapper provided for native iOS experience:

```swift
import sdkKit

struct ContentView: View {
    var body: some View {
        ReplyHQChatView()
    }
}
```

---

## 12. Error Handling

| Scenario | Handling |
|----------|----------|
| App killed mid-send | Message persisted in local DB with QUEUED state. SyncManager picks it up on next launch. |
| Duplicate sends | Server deduplicates by `local_id`. Returns existing message. |
| Token expired | 401 response → Clear state, generate new device_id, start fresh conversation. |
| Server down | Offline mode activates. Queue messages. Retry with exponential backoff. |
| WebSocket dies | Auto-reconnect with backoff. REST fallback for critical sends. |
| User reinstalls | New device_id generated. New conversation starts. |
| User switches account | `ChatSDK.setUser(newUser)` ends current conversation, starts new one. |
| Message too long | Client-side validation (5000 char limit). Show error in UI. |
| Rapid messages | Client-side rate limit (5 msgs/second). Queue excess. |
| No app_id | SDK throws on init. Fail fast. |
| Invalid app_id | Server returns 403. SDK logs error, disables gracefully. |

---

## 13. Dependencies

### 13.1 Common (KMP)

| Dependency | Purpose | Version |
|------------|---------|---------|
| Kotlin Stdlib | Language runtime | 2.x |
| Kotlinx Coroutines | Async operations | 1.8.x |
| Kotlinx Serialization | JSON parsing | 1.6.x |
| Ktor Client | HTTP/WebSocket | 3.x |
| SQLDelight | Local database | 2.x |
| Kotlinx DateTime | Cross-platform time | 0.6.x |

### 13.2 Android-Specific

| Dependency | Purpose |
|------------|---------|
| Jetpack Compose | UI framework |
| Firebase Messaging | Push notifications |
| AndroidX Lifecycle | Lifecycle awareness |

### 13.3 iOS-Specific

| Dependency | Purpose |
|------------|---------|
| Compose Multiplatform | Shared UI |
| Foundation | iOS system APIs |

---

## 14. Testing Requirements

### 14.1 Connectivity Tests

- [ ] Send message online → appears in dashboard
- [ ] Receive message → appears in app
- [ ] Send message offline → queued
- [ ] Restore connection → queued messages sync
- [ ] Kill app while offline, reopen online → messages sync
- [ ] Airplane mode toggle spam → no duplicates

### 14.2 Push Notification Tests

- [ ] App backgrounded → push notification received
- [ ] Tap notification → opens chat
- [ ] App killed → push still works

### 14.3 UI Tests

- [ ] Typing indicator shows
- [ ] Long messages wrap correctly
- [ ] Keyboard doesn't cover input
- [ ] Dark mode looks correct
- [ ] RTL languages work
- [ ] Chat scrolls to bottom on new message

### 14.4 Edge Case Tests

- [ ] Spam send button → no duplicates
- [ ] Empty message → blocked
- [ ] 5000+ char message → blocked with error
- [ ] Invalid appId → graceful failure
- [ ] Reinstall app → new conversation starts

---

## 15. Security Considerations

- App ID validated server-side
- Device ID generated securely (UUID v4)
- All traffic over HTTPS/WSS
- No PII stored in logs
- Token refresh handled transparently
- Rate limiting to prevent abuse

---

## 16. Release Checklist

### Pre-Release
- [ ] All tests passing on Android and iOS
- [ ] API documentation generated
- [ ] Sample app working on both platforms
- [ ] Performance benchmarks met
- [ ] Security review completed

### Distribution
- [ ] Android: Publish to Maven Central
- [ ] iOS: Publish XCFramework to Swift Package Manager
- [ ] Changelog updated
- [ ] Migration guide (if applicable)

---

## 17. Future Considerations (Post-MVP)

- File attachments support
- Rich message types (images, cards, quick replies)
- Analytics/events tracking
- Custom UI components
- Multi-language support (i18n)
- Proactive messaging (server-initiated)
- Chat history export
