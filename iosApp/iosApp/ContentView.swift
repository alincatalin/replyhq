import SwiftUI
import sdkKit

struct ContentView: View {
    @EnvironmentObject private var appState: AppState
    @State private var appId: String = "YOUR_APP_ID"
    @State private var apiKey: String = "YOUR_API_KEY"
    @State private var userId: String = "user_123"
    @State private var userName: String = "Alex Rivera"
    @State private var userEmail: String = "alex@example.com"
    @State private var useLocalhost = false
    @State private var localHost: String = "localhost"
    @State private var localPort: String = "3000"
    @State private var status: String? = nil
    @State private var isInitialized = false
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("ReplyHQ SDK Sample")
                        .font(.title2)
                        .bold()

                    Text("Initialize the SDK, set a user, and open chat.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    Text("Network")
                        .font(.headline)

                    HStack(spacing: 12) {
                        Button("Production") { useLocalhost = false }
                            .disabled(!useLocalhost)
                        Button("Localhost") { useLocalhost = true }
                            .disabled(useLocalhost)
                    }

                    if useLocalhost {
                        TextField("Host (Android emulator: 10.0.2.2)", text: $localHost)
                            .textFieldStyle(.roundedBorder)
                        TextField("Port", text: $localPort)
                            .textFieldStyle(.roundedBorder)
                    }

                    Divider()

                    TextField("App ID", text: $appId)
                        .textFieldStyle(.roundedBorder)
                    TextField("API Key", text: $apiKey)
                        .textFieldStyle(.roundedBorder)

                    HStack(spacing: 12) {
                        Button("Init minimal") {
                            guard !appId.isEmpty else {
                                status = "App ID is required."
                                return
                            }
                            guard !apiKey.isEmpty else {
                                status = "API Key is required."
                                return
                            }
                            guard !isInitialized else {
                                status = "SDK already initialized."
                                return
                            }
                            if useLocalhost {
                                let host = localHost.trimmingCharacters(in: .whitespacesAndNewlines)
                                let resolvedHost = host.isEmpty ? "localhost" : host
                                let port = Int32(localPort) ?? 3000
                                let httpBaseUrl = "http://\(resolvedHost):\(port)/v1"
                                let wsBaseUrl = "ws://\(resolvedHost):\(port)/v1/realtime"
                                let network = NetworkConfig(
                                    baseUrl: httpBaseUrl,
                                    websocketUrl: wsBaseUrl
                                )
                                let config = ChatConfig(appId: appId, apiKey: apiKey, network: network)
                                ReplyHQChatSDK.initialize(config: config)
                            } else {
                                ReplyHQChatSDK.initialize(appId: appId, apiKey: apiKey)
                            }
                            isInitialized = true
                            status = "Initialized with minimal config."
                        }

                        Button("Init full config") {
                            guard !appId.isEmpty else {
                                status = "App ID is required."
                                return
                            }
                            guard !apiKey.isEmpty else {
                                status = "API Key is required."
                                return
                            }
                            guard !isInitialized else {
                                status = "SDK already initialized."
                                return
                            }

                            let theme = ChatTheme(
                                accentColor: Int64(0xFF16A34A),
                                bubblePosition: BubblePosition.bottomRight,
                                darkMode: DarkMode.system
                            )
                            let behavior = ChatBehavior(
                                showBubble: true,
                                enableOfflineQueue: true,
                                maxOfflineMessages: 50,
                                attachmentsEnabled: false,
                                typingIndicators: true
                            )
                            let network: NetworkConfig
                            if useLocalhost {
                                let host = localHost.trimmingCharacters(in: .whitespacesAndNewlines)
                                let resolvedHost = host.isEmpty ? "localhost" : host
                                let port = Int32(localPort) ?? 3000
                                let httpBaseUrl = "http://\(resolvedHost):\(port)/v1"
                                let wsBaseUrl = "ws://\(resolvedHost):\(port)/v1/realtime"
                                network = NetworkConfig(
                                    baseUrl: httpBaseUrl,
                                    websocketUrl: wsBaseUrl
                                )
                            } else {
                                network = NetworkConfig()
                            }
                            let config = ChatConfig(
                                appId: appId,
                                apiKey: apiKey,
                                user: nil,
                                theme: theme,
                                behavior: behavior,
                                network: network
                            )

                            ReplyHQChatSDK.initialize(config: config)
                            isInitialized = true
                            status = "Initialized with full config."
                        }
                    }

                    Button("Reset") {
                        ReplyHQChatSDK.reset()
                        isInitialized = false
                        status = "SDK reset."
                    }
                    .disabled(!isInitialized)

                    if let status = status {
                        Text(status)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Divider()

                    Text("User session")
                        .font(.headline)

                    TextField("User ID", text: $userId)
                        .textFieldStyle(.roundedBorder)
                    TextField("Name", text: $userName)
                        .textFieldStyle(.roundedBorder)
                    TextField("Email", text: $userEmail)
                        .textFieldStyle(.roundedBorder)

                    HStack(spacing: 12) {
                        Button("Set user") {
                            guard isInitialized else {
                                status = "Initialize the SDK first."
                                return
                            }
                            guard !userId.isEmpty else {
                                status = "User ID is required."
                                return
                            }
                            ReplyHQChatSDK.setUser(
                                id: userId.trimmingCharacters(in: .whitespacesAndNewlines),
                                name: userName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : userName,
                                email: userEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : userEmail
                            ) { conversation, error in
                                if let error = error {
                                    print("Set user failed: \(error)")
                                    status = "Set user failed: \(error)"
                                } else if let conversation = conversation {
                                    status = "User set. Conversation: \(conversation.id)"
                                } else {
                                    status = "User set."
                                }
                            }
                        }

                        Button("Clear user") {
                            guard isInitialized else {
                                status = "Initialize the SDK first."
                                return
                            }
                            ReplyHQChatSDK.clearUser {
                                status = "User cleared."
                            }
                        }

                        Button("Open chat") {
                            appState.showChat = true
                        }
                        .disabled(!isInitialized)
                    }
                }
                .padding()
            }
            .navigationTitle("ReplyHQ")
        }
        .sheet(isPresented: $appState.showChat) {
            ReplyHQChatView(isPresented: $appState.showChat)
                .ignoresSafeArea()
        }
    }
}

final class AppState: ObservableObject {
    @Published var showChat: Bool = false
}
