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
        select: { id: true, name: true, apiKeyHash: true },
      });

      if (!app) {
        return res.status(404).json({
          error: 'App not found',
          code: 'APP_NOT_FOUND',
        });
      }

      // Generate masked API key for display (show first 8 chars + "...")
      // Note: In production, you'd need to decrypt or regenerate the actual API key
      // For now, we'll use a placeholder
      const maskedApiKey = 'rq_live_xxxxxxxxxxxxxxxx';
      const actualApiKey = 'rq_live_xxxxxxxxxxxxxxxx'; // TODO: Get actual API key

      const config = {
        apiKey: actualApiKey,
        maskedApiKey,
        appId: app.id,
        appName: app.name,
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
import ReplyHQSDK

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Initialize ReplyHQ
        ReplyHQ.initialize(
            apiKey: "${config.apiKey}",
            appId: "${config.appId}"
        )

        return true
    }
}
\`\`\`

## 3. Send your first message

\`\`\`swift
import ReplyHQSDK

// Send a test message
ReplyHQ.shared.sendMessage(
    conversationId: "support",
    text: "Hello from iOS! 👋"
) { result in
    switch result {
    case .success(let message):
        print("Message sent: \\(message.id)")
    case .failure(let error):
        print("Error: \\(error)")
    }
}
\`\`\`

## 4. Identify users (optional)

\`\`\`swift
ReplyHQ.shared.identify(
    userId: "user_123",
    traits: [
        "name": "Jane Doe",
        "email": "jane@example.com",
        "plan": "pro"
    ]
)
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
    implementation 'com.replyhq:sdk-android:1.0.0'
}
\`\`\`

## 2. Initialize the SDK

In your \`Application\` class:

\`\`\`kotlin
import android.app.Application
import com.replyhq.sdk.ReplyHQ
import com.replyhq.sdk.ReplyHQConfig

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialize ReplyHQ
        val config = ReplyHQConfig.Builder()
            .apiKey("${config.apiKey}")
            .appId("${config.appId}")
            .build()

        ReplyHQ.initialize(this, config)
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
import com.replyhq.sdk.ReplyHQ

// Send a test message
ReplyHQ.getInstance().sendMessage(
    conversationId = "support",
    text = "Hello from Android! 🤖"
) { result ->
    result.onSuccess { message ->
        println("Message sent: \${message.id}")
    }.onFailure { error ->
        println("Error: \${error.message}")
    }
}
\`\`\`

## 4. Identify users (optional)

\`\`\`kotlin
ReplyHQ.getInstance().identify(
    userId = "user_123",
    traits = mapOf(
        "name" to "John Doe",
        "email" to "john@example.com",
        "plan" to "pro"
    )
)
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

export default router;
