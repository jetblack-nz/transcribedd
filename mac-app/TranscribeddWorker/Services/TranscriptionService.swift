import Foundation

/// Runs whisper-cli as a subprocess to transcribe a local audio file.
/// whisper-cli is the whisper.cpp binary installed via Homebrew.
actor TranscriptionService {
    static let shared = TranscriptionService()

    private init() {}

    // MARK: - ffmpeg conversion

    /// Converts any audio format to 16 kHz mono WAV (the only format whisper-cli natively reads).
    /// Returns the path to the converted file; the caller must delete it when done.
    private func convertToWav(_ input: URL) async throws -> URL {
        // Find ffmpeg: Homebrew arm64 puts it at /opt/homebrew/bin, x86 at /usr/local/bin.
        let candidates = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]
        guard let ffmpegPath = candidates.first(where: { FileManager.default.fileExists(atPath: $0) }) else {
            throw WorkerError.transcriptionFailed(
                "ffmpeg not found. Install it with: brew install ffmpeg"
            )
        }

        let wav = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("wav")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: ffmpegPath)
        process.arguments = [
            "-y",               // overwrite without asking
            "-i", input.path,   // input file
            "-ar", "16000",     // 16 kHz sample rate (whisper requirement)
            "-ac", "1",         // mono
            "-c:a", "pcm_s16le",// 16-bit PCM
            wav.path
        ]
        let errPipe = Pipe()
        process.standardOutput = FileHandle.nullDevice
        process.standardError  = errPipe
        try process.run()

        return try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { p in
                if p.terminationStatus == 0 {
                    continuation.resume(returning: wav)
                } else {
                    let msg = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(),
                                     encoding: .utf8)?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? "unknown ffmpeg error"
                    continuation.resume(
                        throwing: WorkerError.transcriptionFailed("ffmpeg conversion failed: \(msg)")
                    )
                }
            }
        }
    }

    // MARK: - Transcription

    /// Transcribes the given audio file and returns the plain-text transcript.
    /// Non-WAV files are automatically converted via ffmpeg first.
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

        // whisper-cli only reads WAV natively; convert everything else via ffmpeg.
        let wavExtensions: Set<String> = ["wav"]
        let needsConversion = !wavExtensions.contains(url.pathExtension.lowercased())
        let audioInput: URL
        if needsConversion {
            audioInput = try await convertToWav(url)
        } else {
            audioInput = url
        }
        defer {
            if needsConversion { try? FileManager.default.removeItem(at: audioInput) }
        }

        // whisper-cli -otxt writes <audiofile-without-extension>.txt next to the input file.
        let outputBase = audioInput.deletingPathExtension().path
        let outputTxt  = URL(fileURLWithPath: outputBase).appendingPathExtension("txt")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: whisperPath)
        process.arguments = [
            "-m",  modelPath,
            "-otxt",
            "-of", outputBase,          // short form, supported in all whisper-cli versions
            "--print-progress",
            "-t",  "\(ProcessInfo.processInfo.processorCount)",
            "-f",  audioInput.path      // explicit -f flag, more reliable than positional arg
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
                // Always capture stderr — useful for diagnostics whether exit was 0 or not.
                let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
                let stderr = String(data: stderrData, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

                if p.terminationStatus == 0 {
                    do {
                        let text = try String(contentsOf: outputTxt, encoding: .utf8)
                        try? FileManager.default.removeItem(at: outputTxt)
                        continuation.resume(returning: text)
                    } catch {
                        // whisper-cli exited 0 but didn't write the file — include stderr for diagnosis.
                        let detail = stderr.isEmpty ? error.localizedDescription : stderr
                        continuation.resume(
                            throwing: WorkerError.transcriptionFailed("No output produced: \(detail)")
                        )
                    }
                } else {
                    let detail = stderr.isEmpty ? "exit code \(p.terminationStatus)" : stderr
                    continuation.resume(
                        throwing: WorkerError.transcriptionFailed(detail)
                    )
                }
            }
        }
    }
}
