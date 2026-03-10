import Foundation

/// Runs whisper-cli as a subprocess to transcribe a local audio file.
/// whisper-cli is the whisper.cpp binary installed via Homebrew.
actor TranscriptionService {
    static let shared = TranscriptionService()

    private init() {}

    /// Transcribes the given audio file and returns the plain-text transcript.
    /// Supported formats: mp3, wav, flac, ogg.
    /// `onProgress` is called on an arbitrary thread with each "progress = X%" line.
    func transcribe(audioFile url: URL, onProgress: (@Sendable (String) -> Void)? = nil) async throws -> String {
        // Read MainActor-isolated settings before entering actor context.
        let (rawWhisperPath, rawModelPath) = await MainActor.run {
            (AppSettings.shared.whisperPath, AppSettings.shared.modelPath)
        }
        let whisperPath = NSString(string: rawWhisperPath).expandingTildeInPath
        let modelPath   = NSString(string: rawModelPath).expandingTildeInPath

        guard FileManager.default.fileExists(atPath: whisperPath) else {
            throw WorkerError.transcriptionFailed("whisper-cli not found at \(whisperPath)")
        }
        guard FileManager.default.fileExists(atPath: modelPath) else {
            throw WorkerError.transcriptionFailed("Whisper model not found at \(modelPath)")
        }

        // whisper-cli -otxt writes <audiofile-without-extension>.txt next to the input file.
        let outputBase = url.deletingPathExtension().path
        let outputTxt  = URL(fileURLWithPath: outputBase).appendingPathExtension("txt")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: whisperPath)
        process.arguments = [
            "-m",  modelPath,
            "-otxt",
            "--output-file", outputBase,
            "--print-progress",
            "-t",  "\(ProcessInfo.processInfo.processorCount)",
            url.path          // positional audio file argument
        ]

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError  = stderrPipe

        // Stream stdout line-by-line and forward progress lines via the callback.
        stdoutPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            for line in text.components(separatedBy: .newlines) {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("progress =") {
                    onProgress?(trimmed)
                }
            }
        }

        try process.run()

        return try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { p in
                stdoutPipe.fileHandleForReading.readabilityHandler = nil
                if p.terminationStatus == 0 {
                    do {
                        let text = try String(contentsOf: outputTxt, encoding: .utf8)
                        try? FileManager.default.removeItem(at: outputTxt)
                        continuation.resume(returning: text)
                    } catch {
                        continuation.resume(
                            throwing: WorkerError.transcriptionFailed("Could not read output file: \(error)")
                        )
                    }
                } else {
                    let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
                    let stderr = String(data: stderrData, encoding: .utf8) ?? "unknown error"
                    continuation.resume(
                        throwing: WorkerError.transcriptionFailed(stderr.trimmingCharacters(in: .whitespacesAndNewlines))
                    )
                }
            }
        }
    }
}
