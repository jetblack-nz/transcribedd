import SwiftUI

@main
struct TranscribeddWorkerApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        // Menu bar icon + popover — no Dock icon (set LSUIElement in Info.plist)
        MenuBarExtra("Transcribedd", systemImage: "waveform") {
            MenuBarView()
                .environmentObject(appState)
        }
        .menuBarExtraStyle(.window)


    }
}
