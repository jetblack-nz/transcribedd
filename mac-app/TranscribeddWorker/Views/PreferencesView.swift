import SwiftUI
import UniformTypeIdentifiers

struct PreferencesView: View {
    @EnvironmentObject private var appState: AppState
    @ObservedObject private var settings = AppSettings.shared
    @State private var isTesting       = false
    @State private var isSigningIn     = false
    @State private var testResult: TestResult?
    @State private var isDownloadingModel = false
    @State private var downloadProgress: Double = 0

    var body: some View {
        TabView {
            supabaseTab.tabItem { Label("Supabase", systemImage: "cloud") }
            whisperTab.tabItem  { Label("Whisper",  systemImage: "waveform") }
            logTab.tabItem      { Label("Log",      systemImage: "text.alignleft") }
        }
        .frame(width: 560, height: 420)
        .padding()
    }

    // MARK: - Supabase tab

    private var supabaseTab: some View {
        Form {
            Section("Supabase Project") {
                LabeledContent("Project URL") {
                    TextField("https://xxxx.supabase.co", text: $settings.supabaseURL)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledContent("Anon Key") {
                    SecureField("eyJhbGc…", text: $settings.supabaseAnonKey)
                        .textFieldStyle(.roundedBorder)
                }
            }

            Section("Authentication") {
                if let email = SupabaseService.shared.signedInEmail {
                    HStack {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                        Text("Signed in as \(email)")
                        Spacer()
                        Button("Sign out") {
                            Task {
                                try? await SupabaseService.shared.signOut()
                                testResult = nil
                            }
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(.secondary)
                    }
                } else {
                    Button(isSigningIn ? "Opening browser…" : "Sign in with GitHub") {
                        Task { await signInWithGitHub() }
                    }
                    .disabled(isSigningIn || settings.supabaseURL.isEmpty || settings.supabaseAnonKey.isEmpty)
                    Text("A browser window will open for GitHub authentication.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let result = testResult {
                Section {
                    HStack {
                        Image(systemName: result.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(result.success ? Color.green : Color.red)
                        Text(result.message)
                            .foregroundStyle(result.success ? Color.primary : Color.red)
                    }
                }
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Log tab

    private var logTab: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Activity Log")
                    .font(.headline)
                Spacer()
                Button("Clear") { appState.clearLog() }
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 4)

            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(appState.logLines.enumerated()), id: \.offset) { index, line in
                            Text(line)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(line.contains("failed") || line.contains("Error") ? Color.red : Color.primary)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .id(index)
                        }
                    }
                    .padding(8)
                }
                .background(Color(NSColor.textBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(NSColor.separatorColor), lineWidth: 0.5)
                )
                .onChange(of: appState.logLines.count) { _, _ in
                    if let last = appState.logLines.indices.last {
                        withAnimation(.easeOut(duration: 0.15)) {
                            proxy.scrollTo(last, anchor: .bottom)
                        }
                    }
                }
            }

            if appState.logLines.isEmpty {
                Text("No activity yet. Start the worker to see logs.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding()
    }

    // MARK: - Whisper tab

    private var whisperTab: some View {
        Form {
            Section("whisper-cli binary") {
                HStack {
                    TextField("/opt/homebrew/bin/whisper-cli", text: $settings.whisperPath)
                        .textFieldStyle(.roundedBorder)
                    Button("Locate…") { pickFile(binding: $settings.whisperPath, allowedTypes: nil) }
                }
                Text("Installed via: brew install whisper-cpp")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Model file (.bin)") {
                HStack {
                    TextField("Path to ggml-small.bin", text: $settings.modelPath)
                        .textFieldStyle(.roundedBorder)
                    Button("Locate…") {
                        pickFile(binding: $settings.modelPath,
                                 allowedTypes: [UTType(filenameExtension: "bin") ?? .data])
                    }
                }

                if isDownloadingModel {
                    ProgressView("Downloading model…", value: downloadProgress, total: 1)
                } else {
                    Button("Download small model (~466 MB)") {
                        Task { await downloadSmallModel() }
                    }
                    .disabled(isDownloadingModel)
                }

                Text("Recommended: ggml-small.bin — good accuracy on Apple Silicon.\nOther models: tiny (75 MB) · base (142 MB) · medium (1.5 GB)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Actions

    private func signInWithGitHub() async {
        isSigningIn = true
        testResult  = nil
        do {
            try SupabaseService.shared.configure()
            try await SupabaseService.shared.signInWithGitHub()
            testResult = TestResult(success: true, message: "Signed in successfully")
        } catch {
            testResult = TestResult(success: false, message: error.localizedDescription)
        }
        isSigningIn = false
    }

    private func pickFile(binding: Binding<String>, allowedTypes: [UTType]?) {
        let panel = NSOpenPanel()
        panel.canChooseFiles       = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        if let types = allowedTypes { panel.allowedContentTypes = types }
        panel.begin { response in
            if response == .OK, let url = panel.url {
                binding.wrappedValue = url.path
            }
        }
    }

    private func downloadSmallModel() async {
        // HuggingFace direct download for ggml-small.bin
        guard let url = URL(string: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin") else { return }

        let destDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".cache/whisper")
        let destURL = destDir.appendingPathComponent("ggml-small.bin")

        if FileManager.default.fileExists(atPath: destURL.path) {
            settings.modelPath = destURL.path
            return
        }

        isDownloadingModel = true
        downloadProgress   = 0

        do {
            try FileManager.default.createDirectory(at: destDir, withIntermediateDirectories: true)

            // Use a delegate-based session so we get real progress callbacks.
            let delegate = DownloadProgressDelegate { [self] fraction in
                Task { @MainActor in self.downloadProgress = fraction }
            }
            let session = URLSession(
                configuration: .default,
                delegate: delegate,
                delegateQueue: nil
            )
            let (tmpURL, _) = try await session.download(from: url)
            try FileManager.default.moveItem(at: tmpURL, to: destURL)
            settings.modelPath = destURL.path
        } catch {
            testResult = TestResult(success: false, message: "Model download failed: \(error.localizedDescription)")
        }

        isDownloadingModel = false
        downloadProgress   = 1
    }

    private struct TestResult {
        let success: Bool
        let message: String
    }
}

// MARK: - URLSession download progress delegate

private final class DownloadProgressDelegate: NSObject, URLSessionDownloadDelegate {
    private let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        guard totalBytesExpectedToWrite > 0 else { return }
        onProgress(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite))
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        // Actual file move is handled in the async/await call site.
    }
}
