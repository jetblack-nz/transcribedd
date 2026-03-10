import Foundation

/// Persists user-facing settings to UserDefaults; password lives in Keychain.
@MainActor
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    @Published var supabaseURL: String {
        didSet { UserDefaults.standard.set(supabaseURL, forKey: Keys.supabaseURL) }
    }
    @Published var supabaseAnonKey: String {
        didSet { UserDefaults.standard.set(supabaseAnonKey, forKey: Keys.supabaseAnonKey) }
    }
    @Published var whisperPath: String {
        didSet {
            let trimmed = whisperPath.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed != whisperPath { whisperPath = trimmed; return }
            UserDefaults.standard.set(whisperPath, forKey: Keys.whisperPath)
        }
    }
    @Published var modelPath: String {
        didSet {
            let trimmed = modelPath.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed != modelPath { modelPath = trimmed; return }
            UserDefaults.standard.set(modelPath, forKey: Keys.modelPath)
        }
    }

    /// Stable per-machine worker identifier, persisted across launches.
    var workerId: String {
        if let existing = UserDefaults.standard.string(forKey: Keys.workerId) { return existing }
        let new = UUID().uuidString
        UserDefaults.standard.set(new, forKey: Keys.workerId)
        return new
    }

    var isConfigured: Bool {
        !supabaseURL.isEmpty && !supabaseAnonKey.isEmpty && !modelPath.isEmpty
    }

    private init() {
        supabaseURL     = UserDefaults.standard.string(forKey: Keys.supabaseURL)     ?? ""
        supabaseAnonKey = UserDefaults.standard.string(forKey: Keys.supabaseAnonKey) ?? ""
        whisperPath     = UserDefaults.standard.string(forKey: Keys.whisperPath)     ?? "/opt/homebrew/bin/whisper-cli"
        modelPath       = UserDefaults.standard.string(forKey: Keys.modelPath)       ?? (NSHomeDirectory() + "/.cache/whisper/ggml-base.bin")
    }

    private enum Keys {
        static let supabaseURL     = "supabaseURL"
        static let supabaseAnonKey = "supabaseAnonKey"
        static let whisperPath     = "whisperPath"
        static let modelPath       = "modelPath"
        static let workerId        = "workerId"
    }
}
