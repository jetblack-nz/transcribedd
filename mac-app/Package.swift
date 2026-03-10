// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "TranscribeddWorker",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(
            url: "https://github.com/supabase-community/supabase-swift",
            from: "2.0.0"
        ),
    ],
    targets: [
        .executableTarget(
            name: "TranscribeddWorker",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
            ],
            path: "TranscribeddWorker",
            exclude: ["Resources/Info.plist", "Resources/TranscribeddWorker.entitlements"],
            swiftSettings: [
                .unsafeFlags(["-strict-concurrency=complete"])
            ]
        ),
    ]
)
