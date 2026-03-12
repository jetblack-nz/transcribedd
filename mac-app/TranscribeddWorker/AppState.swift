import Foundation
import AppKit
import SwiftUI
import Supabase

/// Central observable state for the worker app. Drives the UI and coordinates all services.
@MainActor
final class AppState: ObservableObject {
    static weak var shared: AppState?
    @Published var isRunning    = false
    @Published var isConnected  = false
    @Published var currentJob: Job?
    @Published var recentJobs: [Job] = []
    @Published var statusMessage     = "Stopped"
    @Published var lastError: String?
    @Published var logLines: [String] = []

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    func log(_ message: String) {
        let ts = AppState.dateFormatter.string(from: Date())
        logLines.append("[\(ts)] \(message)")
        if logLines.count > 500 { logLines.removeFirst(logLines.count - 500) }
    }

    func clearLog() { logLines.removeAll() }

    private var workerTask: Task<Void, Never>?
    private var realtimeTask: Task<Void, Never>?
    /// Signalled when Realtime delivers a new pending-job event.
    private var jobAvailableContinuation: CheckedContinuation<Void, Never>?

    private var settingsWindow: NSWindow?

    init() { AppState.shared = self }

    func showSettings() {
        if settingsWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 580, height: 460),
                styleMask: [.titled, .closable, .miniaturizable],
                backing: .buffered,
                defer: false
            )
            window.title = "Preferences"
            window.center()
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: PreferencesView().environmentObject(self))
            settingsWindow = window
        }
        settingsWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - Lifecycle

    func start() async {
        guard !isRunning else { return }
        guard AppSettings.shared.isConfigured else {
            statusMessage = "Not configured — open Settings ⚙"
            return
        }

        isRunning = true
        lastError = nil
        statusMessage = "Connecting…"
        NotificationService.requestPermission()

        do {
            try SupabaseService.shared.configure()
            // If already signed in via Settings, userId is set — skip checkSession.
            if SupabaseService.shared.userId == nil {
                try await SupabaseService.shared.checkSession()
            }
            isConnected  = true
            statusMessage = "Idle — waiting for jobs"
            log("Worker started — connected to Supabase")
            startPollingLoop()
            startRealtimeSubscription()
        } catch {
            // "data couldn't be read" / no session stored = not signed in yet
            lastError    = "Not signed in. Open Settings → sign in with GitHub first."
            statusMessage = "Not signed in"
            log("Start failed: \(error.localizedDescription)")
            isRunning    = false
            isConnected  = false
            showSettings()
        }
    }

    func stop() {
        workerTask?.cancel()
        realtimeTask?.cancel()
        workerTask   = nil
        realtimeTask = nil
        isRunning    = false
        isConnected  = false
        currentJob   = nil
        statusMessage = "Stopped"
    }

    // MARK: - Worker loop

    private func startPollingLoop() {
        workerTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.isRunning else { break }
                let processed = await self.processNextJob()
                if !processed {
                    // No pending job right now.  Sleep up to 30s, but wake
                    // immediately if Realtime delivers a new-job signal.
                    await withTaskGroup(of: Void.self) { group in
                        group.addTask {
                            try? await Task.sleep(for: .seconds(30))
                        }
                        group.addTask { [weak self] in
                            guard let self else { return }
                            await withTaskCancellationHandler {
                                await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                                    Task { @MainActor in
                                        self.jobAvailableContinuation = cont
                                    }
                                }
                            } onCancel: {
                                // Resume the continuation so withCheckedContinuation unblocks
                                // and this task can finish, allowing withTaskGroup to return.
                                Task { @MainActor [weak self] in
                                    self?.jobAvailableContinuation?.resume()
                                    self?.jobAvailableContinuation = nil
                                }
                            }
                        }
                        // First task to finish wins — cancel the other.
                        await group.next()
                        group.cancelAll()
                    }
                    // Clear any leftover continuation after waking.
                    jobAvailableContinuation = nil
                }
            }
        }
    }

    /// Subscribe to the `jobs` table INSERT events via Supabase Realtime.
    /// When a new `pending` job arrives, wake the polling loop immediately.
    private func startRealtimeSubscription() {
        guard let client = SupabaseService.shared.client else { return }
        realtimeTask = Task { [weak self] in
            do {
                let channel = client.channel("public:jobs")
                try await channel.subscribeWithError()
                for await _ in channel.postgresChange(
                    InsertAction.self,
                    schema: "public",
                    table: "jobs"
                ) where !Task.isCancelled {
                    guard let self else { break }
                    await MainActor.run {
                        // Resume the sleep in startPollingLoop so it processes immediately.
                        self.jobAvailableContinuation?.resume()
                        self.jobAvailableContinuation = nil
                    }
                }
                await channel.unsubscribe()
            } catch {
                // Realtime subscription failed — polling fallback will still fire every 30 s.
            }
        }
    }

    /// Claims and processes one pending job. Returns true if a job was processed.
    private func processNextJob() async -> Bool {
        let workerId = AppSettings.shared.workerId

        do {
            guard let job = try await SupabaseService.shared.claimNextJob(workerId: workerId) else {
                return false
            }

            currentJob    = job
            statusMessage = "Downloading: \(job.episodeTitle)"
            log("Job \(job.id): claimed — \(job.episodeTitle)")
            log("Job \(job.id): downloading \(job.episodeUrl)")

            let audioURL = try await DownloadManager().download(from: job.episodeUrl)
            defer { try? FileManager.default.removeItem(at: audioURL) }
            log("Job \(job.id): download complete → \(audioURL.lastPathComponent)")

            statusMessage = "Transcribing: \(job.episodeTitle)"
            log("Job \(job.id): transcription started")
            let transcript = try await TranscriptionService.shared.transcribe(audioFile: audioURL) { [weak self] progress in
                Task { @MainActor [weak self] in
                    self?.log("Job \(job.id): \(progress)")
                }
            }
            log("Job \(job.id): transcription complete (\(transcript.count) chars)")

            statusMessage = "Uploading transcript…"
            log("Job \(job.id): uploading transcript")
            guard let userId = SupabaseService.shared.userId else { throw WorkerError.notAuthenticated }
            let path = try await SupabaseService.shared.uploadTranscript(
                userId: userId, jobId: job.id, content: transcript
            )
            log("Job \(job.id): uploaded → \(path)")

            try await SupabaseService.shared.completeJob(id: job.id, transcriptPath: path)
            log("Job \(job.id): completed ✓")

            appendToRecent(job, status: .completed, transcriptPath: path, error: nil)
            NotificationService.jobCompleted(job)
            currentJob    = nil
            statusMessage = "Idle — waiting for jobs"
            lastError     = nil
            return true

        } catch {
            if let job = currentJob {
                log("Job \(job.id): failed — \(error.localizedDescription)")
                try? await SupabaseService.shared.failJob(id: job.id, error: error.localizedDescription)
                appendToRecent(job, status: .failed, transcriptPath: nil, error: error.localizedDescription)
                NotificationService.jobFailed(job, error: error.localizedDescription)
            } else {
                log("Error: \(error.localizedDescription)")
            }
            currentJob    = nil
            lastError     = error.localizedDescription
            statusMessage  = "Error — retrying in 30s"
            return false
        }
    }

    private func appendToRecent(_ job: Job, status: JobStatus, transcriptPath: String?, error: String?) {
        var updated = job
        updated.status         = status
        updated.transcriptPath = transcriptPath
        updated.errorMessage   = error
        updated.completedAt    = Date()
        recentJobs.insert(updated, at: 0)
        if recentJobs.count > 20 { recentJobs.removeLast() }
    }
}
