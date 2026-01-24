import SwiftUI
import sdkKit

public struct ReplyHQChatView: UIViewControllerRepresentable {
    @Binding private var isPresented: Bool

    public init(isPresented: Binding<Bool>) {
        self._isPresented = isPresented
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(onDismiss: {
            isPresented = false
        })
    }

    public func makeUIViewController(context: Context) -> UIViewController {
        ReplyHQChatViewControllerKt.ReplyHQChatViewController(onDismiss: context.coordinator.onDismiss)
    }

    public func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

    public final class Coordinator {
        let onDismiss: () -> Void

        init(onDismiss: @escaping () -> Void) {
            self.onDismiss = onDismiss
        }
    }
}
