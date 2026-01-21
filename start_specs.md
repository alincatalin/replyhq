Let's go deep on the SDK. This is the product — if integration is painful, nobody uses it.

SDK Specification

1. Initialization & Configuration
   kotlin// Minimal init (most users)
   ChatSDK.init(
   context = applicationContext,
   appId = "app_xxxxxxxxxxxxx"
   )

// Full config
ChatSDK.init(
context = applicationContext,
config = ChatConfig(
appId = "app_xxxxxxxxxxxxx",

        // User identification
        user = ChatUser(
            id = "user_123",              // their internal ID
            name = "Jane Doe",            // optional
            email = "jane@example.com",   // optional
            attributes = mapOf(           // optional custom data
                "plan" to "pro",
                "signup_date" to "2024-01-15"
            )
        ),
        
        // Appearance
        theme = ChatTheme(
            accentColor = Color(0xFF6366F1),
            bubblePosition = BubblePosition.BOTTOM_RIGHT,
            darkMode = DarkMode.SYSTEM     // LIGHT, DARK, SYSTEM
        ),
        
        // Behavior
        behavior = ChatBehavior(
            showBubble = true,             // false if custom trigger
            enableOfflineQueue = true,
            maxOfflineMessages = 50,
            attachmentsEnabled = false,    // MVP: false
            typingIndicators = true
        ),
        
        // Network
        network = NetworkConfig(
            timeout = 30.seconds,
            retryPolicy = RetryPolicy.EXPONENTIAL,
            maxRetries = 3
        ),
        
        // Debug
        logging = LogLevel.ERROR           // NONE, ERROR, DEBUG, VERBOSE
    )
)
```

---

### **2. SDK Architecture**
```
com.yourchat.sdk/
├── ChatSDK.kt                    # Main entry point (singleton)
├── config/
│   ├── ChatConfig.kt
│   ├── ChatUser.kt
│   ├── ChatTheme.kt
│   ├── ChatBehavior.kt
│   └── NetworkConfig.kt
├── ui/
│   ├── ChatBubble.kt             # Floating button composable
│   ├── ChatScreen.kt             # Full chat UI
│   ├── components/
│   │   ├── MessageList.kt
│   │   ├── MessageBubble.kt
│   │   ├── InputBar.kt
│   │   ├── TypingIndicator.kt
│   │   └── ConnectionStatus.kt
│   └── theme/
│       └── ChatTheme.kt
├── data/
│   ├── models/
│   │   ├── Conversation.kt
│   │   ├── Message.kt
│   │   └── DeviceContext.kt
│   ├── local/
│   │   ├── ChatDatabase.kt       # SQLDelight or Room
│   │   ├── MessageQueue.kt       # Offline queue
│   │   └── Preferences.kt        # SDK state
│   └── remote/
│       ├── ChatApi.kt            # REST client
│       ├── RealtimeClient.kt     # WebSocket/SSE
│       └── PushTokenManager.kt
├── core/
│   ├── ConnectionManager.kt      # Network state
│   ├── SyncManager.kt            # Offline sync
│   ├── DeviceContextCollector.kt
│   └── SessionManager.kt
└── platform/                     # expect/actual
├── Platform.kt               # OS detection
├── PushNotifications.kt      # FCM/APNs
└── Connectivity.kt           # Network monitoring

3. Connection Management
   kotlin// Connection states
   enum class ConnectionState {
   CONNECTED,          // WebSocket open, realtime working
   CONNECTING,         // Attempting connection
   DISCONNECTED,       // No connection, will retry
   OFFLINE             // Device has no network
   }

// ConnectionManager.kt
class ConnectionManager {

    val state: StateFlow<ConnectionState>
    
    // Lifecycle
    fun connect()       // Called when chat opens
    fun disconnect()    // Called when chat closes
    fun pause()         // App backgrounded
    fun resume()        // App foregrounded
    
    // Internal behavior:
    // - Monitor device connectivity (expect/actual)
    // - WebSocket with auto-reconnect
    // - Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    // - Heartbeat every 30s to detect dead connections
    // - On reconnect: sync missed messages
}
```

**Connection lifecycle:**
```
App Launch
→ SDK initialized (no connection yet)

User opens chat
→ ConnectionManager.connect()
→ Fetch conversation history (REST)
→ Open WebSocket for realtime

App backgrounded
→ ConnectionManager.pause()
→ Close WebSocket (save battery)
→ Push notifications take over

App foregrounded (chat still open)
→ ConnectionManager.resume()
→ Reconnect WebSocket
→ Sync any missed messages

User closes chat
→ ConnectionManager.disconnect()
→ WebSocket closed

4. Offline Mode
   kotlin// MessageQueue.kt
   class MessageQueue {

   // Pending messages stored locally
   fun enqueue(message: PendingMessage)
   fun peek(): List<PendingMessage>
   fun remove(localId: String)
   fun clear()

   // Message states
   enum class MessageState {
   QUEUED,         // Waiting to send
   SENDING,        // In flight
   SENT,           // Confirmed by server
   FAILED          // Max retries exceeded
   }
   }

// PendingMessage.kt
data class PendingMessage(
val localId: String,        // UUID, generated client-side
val body: String,
val createdAt: Instant,
val state: MessageState,
val retryCount: Int
)
```

**Offline flow:**
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

**Conflict resolution:**
```
User sends message offline at 10:00
Agent replies at 10:01 (user doesn't know)
User comes online at 10:05

Sync process:
1. Push queued user message → server assigns timestamp 10:05
2. Pull missed messages → receive agent message from 10:01
3. Sort all messages by server timestamp
4. Result: Agent reply (10:01) appears before user message (10:05)

This is fine — preserves actual order of when server received them.

5. Chat Data Models
   kotlin// Conversation.kt
   data class Conversation(
   val id: String,
   val status: ConversationStatus,
   val createdAt: Instant,
   val updatedAt: Instant,
   val unreadCount: Int
   )

enum class ConversationStatus {
OPEN,
RESOLVED
}

// Message.kt
data class Message(
val id: String,                 // Server ID (null if pending)
val localId: String,            // Client ID (always present)
val conversationId: String,
val sender: Sender,
val body: String,
val createdAt: Instant,
val state: MessageState         // For UI rendering
)

enum class Sender {
USER,
AGENT
}

// DeviceContext.kt
data class DeviceContext(
val platform: String,           // "android" | "ios"
val osVersion: String,          // "14.0"
val appVersion: String,         // From BuildConfig
val deviceModel: String,        // "Pixel 7"
val locale: String,             // "en_US"
val timezone: String,           // "America/New_York"
val sdkVersion: String          // "1.0.0"
)

6. API Contract
   yamlBase URL: https://api.yourchat.dev/v1

Headers (all requests):
X-App-Id: app_xxxxxxxxxxxxx
X-Device-Id: <generated on first launch, persisted>
X-SDK-Version: 1.0.0
Content-Type: application/json

---

POST /conversations
# Get or create conversation for this user/device

Request:
{
"user": {
"id": "user_123",           # optional
"name": "Jane Doe",         # optional
"email": "jane@doe.com",    # optional
"attributes": {}            # optional
},
"device_context": {
"platform": "android",
"os_version": "14",
"app_version": "2.1.0",
"device_model": "Pixel 7",
"locale": "en_US",
"timezone": "America/New_York"
}
}

Response:
{
"conversation": {
"id": "conv_xxx",
"status": "open",
"created_at": "2024-01-15T10:00:00Z"
},
"messages": [...]             # Last 50 messages
}

---

POST /conversations/:id/messages
# Send a message

Request:
{
"local_id": "uuid-xxx",       # Client-generated
"body": "Hello!"
}

Response:
{
"message": {
"id": "msg_xxx",            # Server ID
"local_id": "uuid-xxx",
"sender": "user",
"body": "Hello!",
"created_at": "2024-01-15T10:00:00Z"
}
}

---

GET /conversations/:id/messages?after=<timestamp>
# Fetch messages after timestamp (for sync)

Response:
{
"messages": [...]
}

---

POST /push-token
# Register device for push notifications

Request:
{
"token": "fcm_or_apns_token",
"platform": "android"         # or "ios"
}

---

WebSocket: wss://api.yourchat.dev/v1/realtime?app_id=xxx&device_id=xxx

# Server → Client events:
{
"type": "message.new",
"data": { "message": {...} }
}

{
"type": "agent.typing",
"data": { "conversation_id": "conv_xxx" }
}

# Client → Server events:
{
"type": "user.typing",
"data": { "conversation_id": "conv_xxx" }
}

{
"type": "ping"
}

7. Edge Cases & Error Handling
   ScenarioHandlingApp killed mid-sendMessage already in local DB with QUEUED state. On next launch, SyncManager picks it up.Duplicate sendsServer dedupes by local_id. Returns existing message if already received.Token expired401 response → SDK clears state, creates new device_id, starts fresh conversation.Server downOffline mode kicks in. Queue messages. Retry with backoff.WebSocket diesAuto-reconnect with backoff. REST fallback for critical sends.User uninstalls/reinstallsNew device_id generated. New conversation starts. Old data gone (acceptable for MVP).User switches accountsDev calls ChatSDK.setUser(newUser) → ends current conversation, starts new one.Message too longClient-side validation (5000 char limit). Show error in UI.Rapid messagesClient-side rate limit (5 msgs/second). Queue excess.No app_id providedSDK throws on init. Fail fast.Invalid app_idServer returns 403. SDK logs error, disables itself gracefully.

8. Public API Surface
   Keep it tiny. Developers should need to read one page of docs.
   kotlin// === INITIALIZATION ===

ChatSDK.init(context, appId)
ChatSDK.init(context, config)

// === USER MANAGEMENT ===

ChatSDK.setUser(user: ChatUser)     // Identify user
ChatSDK.clearUser()                 // Logout

// === UI COMPONENTS ===

@Composable
fun ChatBubble()                    // Floating button

@Composable  
fun ChatScreen(
onDismiss: () -> Unit           // Back button handler
)

// === PROGRAMMATIC CONTROL ===

ChatSDK.open()                      // Open chat programmatically
ChatSDK.close()                     // Close chat
ChatSDK.unreadCount: StateFlow<Int> // Badge count

// === LIFECYCLE (optional, auto-detected) ===

ChatSDK.onAppForegrounded()
ChatSDK.onAppBackgrounded()

// === DEBUG ===

ChatSDK.reset()                     // Clear all local data
```
---

### **9. Testing Checklist Before Launch**
```
Connectivity:
[ ] Send message online → appears in dashboard
[ ] Receive message → appears in app
[ ] Send message offline → queued
[ ] Restore connection → queued messages sync
[ ] Kill app while offline, reopen online → messages sync
[ ] Airplane mode toggle spam → no duplicates

Push:
[ ] App backgrounded → push notification received
[ ] Tap notification → opens chat
[ ] App killed → push still works

UI:
[ ] Typing indicator shows
[ ] Long messages wrap correctly
[ ] Keyboard doesn't cover input
[ ] Dark mode looks right
[ ] RTL languages work
[ ] Chat scrolls to bottom on new message

Edge cases:
[ ] Spam send button → no duplicates
[ ] Empty message → blocked
[ ] 5000+ char message → blocked with error
[ ] Invalid appId → graceful failure
[ ] Reinstall app → new conversation starts