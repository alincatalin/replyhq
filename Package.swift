// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ReplySDK",
    platforms: [.iOS(.v13)],
    products: [
        .library(name: "sdkKit", targets: ["sdkKit"])
    ],
    targets: [
        .binaryTarget(
            name: "sdkKit",
            url: "https://github.com/alincatalin/replyhq/releases/download/v0.1.0/sdkKit.xcframework.zip",
            checksum: "7fa26821e8288ffc42c011bd96e6f18d982059aa8fb12ebbe9732cc220e24ca7"
        )
    ]
)
