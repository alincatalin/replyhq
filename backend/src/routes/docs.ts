import express, { Request, Response, NextFunction, type IRouter } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireJWT } from '../middleware/jwt.js';
import { requirePermission, Permission } from '../middleware/permissions.js';

const router: IRouter = express.Router();

/**
 * GET /admin/docs/quickstart/:platform
 * Get platform-specific quickstart guide with actual API credentials
 */
router.get(
  '/quickstart/:platform',
  requireJWT,
  requirePermission(Permission.VIEW_SETTINGS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { platform } = req.params;
      const { appId } = req.jwtPayload!;

      const validPlatforms = ['ios', 'android', 'react-native', 'flutter'];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({
          error: 'Invalid platform',
          code: 'INVALID_PLATFORM',
          message: `Platform must be one of: ${validPlatforms.join(', ')}`,
        });
      }

      const app = await prisma.app.findUnique({
        where: { id: appId },
        select: { id: true, name: true, apiKey: true },
      });

      if (!app) {
        return res.status(404).json({
          error: 'App not found',
          code: 'APP_NOT_FOUND',
        });
      }

      const actualApiKey = app.apiKey || null;
      const maskedApiKey = actualApiKey ? maskApiKey(actualApiKey) : 'rq_live_************************';

      const config = {
        apiKey: actualApiKey,
        maskedApiKey,
        appId: app.id,
        appName: app.name,
        apiKeyAvailable: Boolean(actualApiKey),
      };

      const markdown = generateQuickstartMarkdown(platform, config);
      const codeSnippets = extractCodeSnippets(markdown);

      return res.json({
        platform,
        markdown,
        codeSnippets,
        config: {
          appId: app.id,
          appName: app.name,
          maskedApiKey,
          apiKey: actualApiKey,
          apiKeyAvailable: Boolean(actualApiKey),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Generate platform-specific quickstart markdown
 */
function generateQuickstartMarkdown(platform: string, config: any): string {
  const apiKey = config.apiKey || config.maskedApiKey;
  const appId = config.appId;
  switch (platform) {
    case 'ios':
      return `# iOS Quickstart (5 minutes)

Get started with ReplyHQ in your iOS app.

## Prerequisites
- iOS 13.0 or later
- Xcode 13.0 or later
- Swift 5.5 or later

## 1. Install via CocoaPods

Add ReplyHQ to your \`Podfile\`:

\`\`\`ruby
pod 'ReplyHQSDK', '~> 1.0'
\`\`\`

Then run:

\`\`\`bash
pod install
\`\`\`

## 2. Initialize the SDK

In your \`AppDelegate.swift\`:

\`\`\`swift
import UIKit
import sdkKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Initialize ReplyHQ
        ReplyHQChatSDK.initialize(appId: "${appId}", apiKey: "${apiKey}")

        return true
    }
}
\`\`\`

## 3. Send your first message

\`\`\`swift
import SwiftUI
import sdkKit

struct SupportView: View {
    @State private var showChat = false

    var body: some View {
        Button("Open ReplyHQ") { showChat = true }
            .sheet(isPresented: $showChat) {
                ReplyHQChatView(isPresented: $showChat)
            }
    }
}
\`\`\`

## 4. Identify users (optional)

\`\`\`swift
ReplyHQChatSDK.setUser(
    id: "user_123",
    name: "Jane Doe",
    email: "jane@example.com",
    attributes: ["plan": "pro"]
) { conversation, error in
    if let error = error {
        print("Error: \\(error)")
    }
}
\`\`\`

## Next steps

✅ Check your dashboard - you should see the message appear!

- [View full iOS documentation](https://docs.replyhq.dev/sdk/ios)
- [See example iOS app](https://github.com/replyhq/examples/tree/main/ios)
- [Configure push notifications](https://docs.replyhq.dev/sdk/ios/push-notifications)
`;

    case 'android':
      return `# Android Quickstart (5 minutes)

Get started with ReplyHQ in your Android app.

## Prerequisites
- Android 6.0 (API level 23) or higher
- Kotlin 1.7 or later
- Gradle 7.0 or later

## 1. Add dependency

In your app's \`build.gradle\`:

\`\`\`gradle
dependencies {
    implementation("dev.replyhq:sdk:0.1.0")
}
\`\`\`

## 2. Initialize the SDK

In your \`Application\` class:

\`\`\`kotlin
import android.app.Application
import dev.replyhq.sdk.ChatSDK

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialize ReplyHQ
        ChatSDK.init(
            context = this,
            appId = "${appId}",
            apiKey = "${apiKey}"
        )
    }
}
\`\`\`

Don't forget to register your Application class in \`AndroidManifest.xml\`:

\`\`\`xml
<application
    android:name=".MyApplication"
    ...>
\`\`\`

## 3. Send your first message

\`\`\`kotlin
import androidx.lifecycle.lifecycleScope
import dev.replyhq.sdk.ChatSDK

// Send a test message
lifecycleScope.launch {
    ChatSDK.sendMessage("Hello from Android! 🤖")
}
\`\`\`

## 4. Identify users (optional)

\`\`\`kotlin
import dev.replyhq.sdk.ChatSDK
import dev.replyhq.sdk.config.ChatUser

lifecycleScope.launch {
    ChatSDK.setUser(
        ChatUser(
            id = "user_123",
            name = "John Doe",
            email = "john@example.com",
            attributes = mapOf("plan" to "pro")
        )
    )
}
\`\`\`

## Next steps

✅ Check your dashboard - you should see the message appear!

- [View full Android documentation](https://docs.replyhq.dev/sdk/android)
- [See example Android app](https://github.com/replyhq/examples/tree/main/android)
- [Configure push notifications](https://docs.replyhq.dev/sdk/android/push-notifications)
`;

    case 'react-native':
      return `# React Native Quickstart (5 minutes)

Get started with ReplyHQ in your React Native app.

## Prerequisites
- React Native 0.68 or later
- Node.js 14 or later

## 1. Install package

\`\`\`bash
npm install @replyhq/react-native
# or
yarn add @replyhq/react-native
\`\`\`

### iOS Setup

\`\`\`bash
cd ios && pod install && cd ..
\`\`\`

### Android Setup

No additional setup required!

## 2. Initialize the SDK

In your \`App.tsx\` or \`index.js\`:

\`\`\`typescript
import React, { useEffect } from 'react';
import ReplyHQ from '@replyhq/react-native';

function App() {
  useEffect(() => {
    // Initialize ReplyHQ
    ReplyHQ.initialize({
      apiKey: '${config.apiKey}',
      appId: '${config.appId}',
    });
  }, []);

  return (
    // Your app components
  );
}

export default App;
\`\`\`

## 3. Send your first message

\`\`\`typescript
import ReplyHQ from '@replyhq/react-native';

// Send a test message
const sendTestMessage = async () => {
  try {
    const message = await ReplyHQ.sendMessage({
      conversationId: 'support',
      text: 'Hello from React Native! ⚛️',
    });
    console.log('Message sent:', message.id);
  } catch (error) {
    console.error('Error:', error);
  }
};
\`\`\`

## 4. Identify users (optional)

\`\`\`typescript
ReplyHQ.identify('user_123', {
  name: 'Sarah Smith',
  email: 'sarah@example.com',
  plan: 'pro',
});
\`\`\`

## Next steps

✅ Check your dashboard - you should see the message appear!

- [View full React Native documentation](https://docs.replyhq.dev/sdk/react-native)
- [See example React Native app](https://github.com/replyhq/examples/tree/main/react-native)
- [Configure push notifications](https://docs.replyhq.dev/sdk/react-native/push-notifications)
`;

    case 'flutter':
      return `# Flutter Quickstart (5 minutes)

Get started with ReplyHQ in your Flutter app.

## Prerequisites
- Flutter 3.0 or later
- Dart 2.17 or later

## 1. Add dependency

In your \`pubspec.yaml\`:

\`\`\`yaml
dependencies:
  replyhq_flutter: ^1.0.0
\`\`\`

Then run:

\`\`\`bash
flutter pub get
\`\`\`

## 2. Initialize the SDK

In your \`main.dart\`:

\`\`\`dart
import 'package:flutter/material.dart';
import 'package:replyhq_flutter/replyhq_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize ReplyHQ
  await ReplyHQ.initialize(
    apiKey: '${config.apiKey}',
    appId: '${config.appId}',
  );

  runApp(MyApp());
}
\`\`\`

## 3. Send your first message

\`\`\`dart
import 'package:replyhq_flutter/replyhq_flutter.dart';

// Send a test message
Future<void> sendTestMessage() async {
  try {
    final message = await ReplyHQ.sendMessage(
      conversationId: 'support',
      text: 'Hello from Flutter! 🦋',
    );
    print('Message sent: \${message.id}');
  } catch (error) {
    print('Error: \$error');
  }
}
\`\`\`

## 4. Identify users (optional)

\`\`\`dart
await ReplyHQ.identify(
  userId: 'user_123',
  traits: {
    'name': 'Alex Johnson',
    'email': 'alex@example.com',
    'plan': 'pro',
  },
);
\`\`\`

## Next steps

✅ Check your dashboard - you should see the message appear!

- [View full Flutter documentation](https://docs.replyhq.dev/sdk/flutter)
- [See example Flutter app](https://github.com/replyhq/examples/tree/main/flutter)
- [Configure push notifications](https://docs.replyhq.dev/sdk/flutter/push-notifications)
`;

    default:
      return '# Unsupported platform';
  }
}

/**
 * Extract code snippets from markdown
 */
function extractCodeSnippets(markdown: string): Array<{ language: string; code: string; label?: string }> {
  const snippets: Array<{ language: string; code: string; label?: string }> = [];
  const codeBlockRegex = /```(\w+)\n([\s\S]*?)```/g;

  let match;
  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    snippets.push({
      language: match[1],
      code: match[2].trim(),
    });
  }

  return snippets;
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}****`;
  }
  const prefix = apiKey.slice(0, 6);
  const suffix = apiKey.slice(-4);
  return `${prefix}****${suffix}`;
}

export default router;
