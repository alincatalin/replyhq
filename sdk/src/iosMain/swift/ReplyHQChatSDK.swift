import Foundation
import sdkKit

public enum ReplyHQChatSDK {
    private static let bridge = ChatSDKBridge()

    public static func initialize(appId: String, apiKey: String) {
        bridge.initialize(appId: appId, apiKey: apiKey)
    }

    public static func initialize(config: ChatConfig) {
        bridge.initialize(config: config)
    }

    public static func setUser(
        id: String,
        name: String? = nil,
        email: String? = nil,
        attributes: [String: String] = [:],
        completion: @escaping (Conversation?, String?) -> Void
    ) {
        let user = ChatUser(id: id, name: name, email: email, attributes: attributes)
        bridge.setUser(user: user, completion: completion)
    }

    public static func clearUser(completion: (() -> Void)? = nil) {
        bridge.clearUser(completion: completion)
    }

    public static func reset() {
        bridge.reset()
    }

    public static func handlePush(payload: [String: String], showNotification: Bool = true) {
        bridge.handlePush(payload: payload, showNotification: showNotification)
    }

    public static func updatePushToken(token: String) {
        ChatSDK.shared.updatePushToken(token: token)
    }
}
