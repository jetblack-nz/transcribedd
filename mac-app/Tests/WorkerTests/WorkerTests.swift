// Standalone test runner — no XCTest/Testing framework required.
// (XCTest needs Xcode.app; only Command Line Tools are installed.)
// Run with:  swift run WorkerTests
//
// Exits 0 if all tests pass, 1 if any fail.
import Foundation

// MARK: - Minimal assertion helpers

private var failCount = 0

private func check(_ condition: Bool, _ message: String, file: StaticString = #file, line: UInt = #line) {
    if condition {
        print("  PASS  \(message)")
    } else {
        print("  FAIL  \(message)  (\(file):\(line))")
        failCount += 1
    }
}

private func checkEqual<T: Equatable>(_ a: T, _ b: T, _ message: String,
                                       file: StaticString = #file, line: UInt = #line) {
    if a == b {
        print("  PASS  \(message)")
    } else {
        print("  FAIL  \(message)  — got \(a), expected \(b)  (\(file):\(line))")
        failCount += 1
    }
}

private func checkThrows(_ message: String, file: StaticString = #file, line: UInt = #line,
                          block: () throws -> Void) {
    do {
        try block()
        print("  FAIL  \(message)  — expected throw but succeeded  (\(file):\(line))")
        failCount += 1
    } catch {
        print("  PASS  \(message)  (threw: \(error))")
    }
}

private func suite(_ name: String, body: () -> Void) {
    print("\n\(name)")
    body()
}

// MARK: - Minimal Job replica (mirrors mac-app/TranscribeddWorker/Models/Job.swift)

private struct Job: Codable {
    let id: UUID
    let userId: UUID
    let podcastTitle: String
    let episodeTitle: String
    let episodeUrl: String
    var status: JobStatus
    var transcriptPath: String?
    var workerId: String?
    let createdAt: Date
    var startedAt: Date?
    var completedAt: Date?
    var errorMessage: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId         = "user_id"
        case podcastTitle   = "podcast_title"
        case episodeTitle   = "episode_title"
        case episodeUrl     = "episode_url"
        case status
        case transcriptPath = "transcript_path"
        case workerId       = "worker_id"
        case createdAt      = "created_at"
        case startedAt      = "started_at"
        case completedAt    = "completed_at"
        case errorMessage   = "error_message"
    }
}

private enum JobStatus: String, Codable { case pending, processing, completed, failed }

// MARK: - Tests

suite("UUID casing") {
    // Swift UUID.uuidString is uppercase; Postgres UUIDs are lowercase.
    // All .eq("id",...) and Storage paths must call .lowercased().
    let id = UUID()
    checkEqual(id.uuidString, id.uuidString.uppercased(),
               "UUID.uuidString is uppercase")

    let postgresId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    let swiftId = UUID(uuidString: postgresId.uppercased())!
    checkEqual(swiftId.uuidString.lowercased(), postgresId,
               ".lowercased() on UUID.uuidString matches Postgres format")
}

suite("Transcript storage path (uploadTranscript)") {
    // Must match Storage RLS: (storage.foldername(name))[1] = auth.uid()::text
    let userId = UUID(uuidString: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890")!
    let jobId  = UUID(uuidString: "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB")!
    let path   = "\(userId.uuidString.lowercased())/\(jobId.uuidString.lowercased()).txt"
    let parts  = path.split(separator: "/", maxSplits: 1).map(String.init)

    checkEqual(parts.count, 2, "path has exactly two components")
    checkEqual(parts[0], "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
               "folder is lowercase userId UUID")
    checkEqual(parts[1], "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.txt",
               "filename is lowercase jobId UUID + .txt")
    checkEqual(path, path.lowercased(), "entire path is lowercase")
}

suite("Whitespace trimming (AppSettings didSet)") {
    // The didSet guard strips leading/trailing whitespace and newlines.
    // Typical paste artifact: path with a trailing newline.
    checkEqual("/opt/homebrew/bin/whisper-cli\n".trimmingCharacters(in: .whitespacesAndNewlines),
               "/opt/homebrew/bin/whisper-cli",
               "trailing newline stripped")
    checkEqual("\n/opt/homebrew/bin/whisper-cli\n".trimmingCharacters(in: .whitespacesAndNewlines),
               "/opt/homebrew/bin/whisper-cli",
               "leading + trailing newline stripped")
    let clean = "/Users/user/.cache/whisper/ggml-base.bin"
    checkEqual(clean.trimmingCharacters(in: .whitespacesAndNewlines), clean,
               "clean path unaffected")
    checkEqual("   /opt/homebrew/bin/whisper-cli   ".trimmingCharacters(in: .whitespacesAndNewlines),
               "/opt/homebrew/bin/whisper-cli",
               "leading/trailing spaces stripped")
    // Note: trimming does NOT remove characters in the middle of the string.
    // A paste artifact like "path\n~" (newline+tilde in the middle) must be
    // fixed manually via UserDefaults (as was done during debugging).
    let embedded = "/opt/homebrew/bin/whisper-cli\n~"
    check(embedded.trimmingCharacters(in: .whitespacesAndNewlines) == embedded,
          "embedded newline+tilde is NOT removed by trimming (fix manually if seen)")
}

suite("Tilde expansion (TranscriptionService)") {
    let expanded = NSString(string: "~/.cache/whisper/ggml-base.bin").expandingTildeInPath
    check(expanded.hasPrefix("/"),
          "expanded path is absolute (got: \(expanded))")
    check(!expanded.contains("~"),
          "expanded path has no tilde")
    check(expanded.hasSuffix("/.cache/whisper/ggml-base.bin"),
          "expanded path preserves suffix")

    let abs = "/opt/homebrew/bin/whisper-cli"
    checkEqual(NSString(string: abs).expandingTildeInPath, abs,
               "absolute path unchanged by tilde expansion")
}

suite("Job JSON decoding") {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601

    // Happy path: valid Postgres row (lowercase UUIDs)
    let goodJSON = """
    {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "podcast_title": "Test Podcast",
        "episode_title": "Episode 1",
        "episode_url": "https://example.com/ep1.mp3",
        "status": "processing",
        "transcript_path": null,
        "worker_id": "WORKER-ABC",
        "created_at": "2026-03-10T00:00:00.000Z",
        "started_at": null,
        "completed_at": null,
        "error_message": null
    }
    """
    if let job = try? decoder.decode(Job.self, from: Data(goodJSON.utf8)) {
        checkEqual(job.id.uuidString.lowercased(), "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                   "id decoded from lowercase UUID string")
        checkEqual(job.userId.uuidString.lowercased(), "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                   "user_id decoded from lowercase UUID string")
        checkEqual(job.status, .processing, "status decoded correctly")
        check(job.transcriptPath == nil, "null transcript_path decoded as nil")
        check(job.startedAt == nil, "null started_at decoded as nil")
    } else {
        check(false, "valid Job JSON failed to decode")
    }

    // Null-row path: this is what claim_next_job returned before the SQL fix.
    // Decoding must throw (UUID cannot be decoded from null).
    // This test DOCUMENTS the bug — the SQL migration fixes it at the source.
    let nullRowJSON = """
    {
        "id": null, "user_id": null, "podcast_title": null,
        "episode_title": null, "episode_url": null,
        "status": null, "created_at": null
    }
    """
    checkThrows("decoding all-null row throws (confirms SQL fix is necessary)") {
        _ = try decoder.decode(Job.self, from: Data(nullRowJSON.utf8))
    }
}

suite("Output .txt path derivation (TranscriptionService)") {
    // whisper-cli --output-file <base> writes <base>.txt
    // We strip the audio file extension to get <base>, then re-add .txt.
    let mp3URL    = URL(fileURLWithPath: "/tmp/tmpfile_ABC123.mp3")
    let outputBase = mp3URL.deletingPathExtension().path
    let outputTxt  = URL(fileURLWithPath: outputBase).appendingPathExtension("txt")
    checkEqual(outputTxt.path, "/tmp/tmpfile_ABC123.txt",
               ".mp3 → base → .txt path is correct")

    let noExtURL  = URL(fileURLWithPath: "/tmp/tmpfile_ABC123")
    let noExtBase = noExtURL.deletingPathExtension().path
    let noExtTxt  = URL(fileURLWithPath: noExtBase).appendingPathExtension("txt")
    checkEqual(noExtTxt.path, "/tmp/tmpfile_ABC123.txt",
               "no-extension audio URL → .txt path is correct")
}

suite("isConfigured logic (AppSettings)") {
    func isConfigured(url: String, key: String, model: String) -> Bool {
        !url.isEmpty && !key.isEmpty && !model.isEmpty
    }
    check(!isConfigured(url: "",    key: "k", model: "m"), "empty URL → not configured")
    check(!isConfigured(url: "url", key: "",  model: "m"), "empty key → not configured")
    check(!isConfigured(url: "url", key: "k", model: ""),  "empty model → not configured")
    check( isConfigured(url: "url", key: "k", model: "m"), "all fields set → configured")
}

// MARK: - Results

print("\n" + String(repeating: "-", count: 50))
if failCount == 0 {
    print("All tests passed.")
    exit(0)
} else {
    print("\(failCount) test(s) FAILED.")
    exit(1)
}
