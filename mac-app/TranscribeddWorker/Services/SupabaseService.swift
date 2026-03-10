import Foundation
import AuthenticationServices
@preconcurrency import Supabase

// MARK: - Errors

enum WorkerError: LocalizedError {
    case missingConfiguration
    case notConfigured
    case notAuthenticated
    case downloadFailed(String)
    case transcriptionFailed(String)
    case uploadFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:        return "Missing configuration — open Settings."
        case .notConfigured:               return "Supabase client not initialised."
        case .notAuthenticated:            return "Not signed in."
        case .downloadFailed(let msg):     return "Download failed: \(msg)"
        case .transcriptionFailed(let msg): return "Transcription failed: \(msg)"
        case .uploadFailed(let msg):       return "Upload failed: \(msg)"
        }
    }
}

// MARK: - Encodable update payloads

private struct ProcessingUpdate: Encodable {
    let status: String = "processing"
    let startedAt: String
    let workerId: String
    enum CodingKeys: String, CodingKey {
        case status
        case startedAt = "started_at"
        case workerId  = "worker_id"
    }
}

private struct CompletionUpdate: Encodable {
    let status: String = "completed"
    let completedAt: String
    let transcriptPath: String
    enum CodingKeys: String, CodingKey {
        case status
        case completedAt   = "completed_at"
        case transcriptPath = "transcript_path"
    }
}

private struct FailureUpdate: Encodable {
    let status: String = "failed"
    let completedAt: String
    let errorMessage: String
    enum CodingKeys: String, CodingKey {
        case status
        case completedAt  = "completed_at"
        case errorMessage = "error_message"
    }
}

// MARK: - SupabaseService

@MainActor
final class SupabaseService {
    static let shared = SupabaseService()

    private(set) var client: SupabaseClient?
    private(set) var userId: UUID?
    private(set) var signedInEmail: String?

    private static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private init() {}

    // MARK: Auth

    func configure() throws {
        guard client == nil else { return }   // already configured — keep existing session
        let s = AppSettings.shared
        guard let url = URL(string: s.supabaseURL), !s.supabaseAnonKey.isEmpty else {
            throw WorkerError.missingConfiguration
        }
        client = SupabaseClient(supabaseURL: url, supabaseKey: s.supabaseAnonKey)
    }

    /// Restore an existing persisted session (no browser needed).
    func checkSession() async throws {
        guard let client else { throw WorkerError.notConfigured }
        let session = try await client.auth.session
        userId       = session.user.id
        signedInEmail = session.user.email
    }

    /// Launch GitHub OAuth in a system browser sheet and complete sign-in.
    func signInWithGitHub() async throws {
        guard let client else { throw WorkerError.notConfigured }
        let redirectURL = URL(string: "transcribedd://auth-callback")!
        let session = try await client.auth.signInWithOAuth(
            provider: .github,
            redirectTo: redirectURL
        ) { authSession in
            authSession.presentationContextProvider = OAuthPresentationContext.shared
            authSession.prefersEphemeralWebBrowserSession = false
        }
        userId        = session.user.id
        signedInEmail = session.user.email
    }

    func signOut() async throws {
        guard let client else { return }
        try await client.auth.signOut()
        userId        = nil
        signedInEmail = nil
    }

    // MARK: Jobs

    /// Atomically claims the next pending job via the SQL RPC function.
    /// Returns nil when there are no pending jobs.
    func claimNextJob(workerId: String) async throws -> Job? {
        guard let client else { throw WorkerError.notConfigured }

        struct Params: Encodable { let p_worker_id: String }

        let jobs: [Job] = try await client
            .rpc("claim_next_job", params: Params(p_worker_id: workerId))
            .execute()
            .value

        return jobs.first
    }

    func completeJob(id: UUID, transcriptPath: String) async throws {
        guard let client else { throw WorkerError.notConfigured }
        try await client
            .from("jobs")
            .update(CompletionUpdate(
                completedAt: Self.iso8601.string(from: Date()),
                transcriptPath: transcriptPath
            ))
            .eq("id", value: id.uuidString)
            .execute()
    }

    func failJob(id: UUID, error: String) async throws {
        guard let client else { throw WorkerError.notConfigured }
        try await client
            .from("jobs")
            .update(FailureUpdate(
                completedAt: Self.iso8601.string(from: Date()),
                errorMessage: error
            ))
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: Storage

    /// Uploads the transcript text and returns the storage path.
    func uploadTranscript(userId: UUID, jobId: UUID, content: String) async throws -> String {
        guard let client else { throw WorkerError.notConfigured }
        guard let data = content.data(using: .utf8) else {
            throw WorkerError.uploadFailed("Failed to encode transcript as UTF-8")
        }
        let path = "\(userId.uuidString)/\(jobId.uuidString).txt"
        try await client.storage
            .from("transcripts")
            .upload(path, data: data, options: FileOptions(contentType: "text/plain"))
        return path
    }
}

// MARK: - OAuth presentation context

/// Provides an NSWindow anchor for ASWebAuthenticationSession without needing a main window.
final class OAuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = OAuthPresentationContext()
    private override init() {}

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.windows.first ?? NSWindow()
    }
}
