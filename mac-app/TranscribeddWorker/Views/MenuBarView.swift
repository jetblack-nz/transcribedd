import SwiftUI
import AppKit

struct MenuBarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // ── Header ──────────────────────────────────────────────
            HStack(spacing: 6) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                Text(appState.isRunning ? "Running" : "Stopped")
                    .font(.headline)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)

            Text(appState.statusMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)
                .padding(.top, 2)

            if let error = appState.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(2)
                    .padding(.horizontal, 12)
                    .padding(.top, 2)
            }

            Divider().padding(.vertical, 6)

            // ── Current job ─────────────────────────────────────────
            if let job = appState.currentJob {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Processing", systemImage: "waveform.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(job.episodeTitle)
                        .font(.body)
                        .lineLimit(2)
                    Text(job.podcastTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 12)

                ProgressView()
                    .scaleEffect(0.7)
                    .padding(.horizontal, 12)
                    .padding(.top, 4)

                Divider().padding(.vertical, 6)
            }

            // ── Recent jobs ─────────────────────────────────────────
            if !appState.recentJobs.isEmpty {
                Text("Recent")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)

                ForEach(appState.recentJobs.prefix(5)) { job in
                    HStack(spacing: 6) {
                        Image(systemName: job.status == .completed
                              ? "checkmark.circle.fill"
                              : "xmark.circle.fill")
                            .foregroundStyle(job.status == .completed ? .green : .red)
                            .font(.caption)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(job.episodeTitle)
                                .font(.caption)
                                .lineLimit(1)
                            Text(job.podcastTitle)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 2)
                }

                Divider().padding(.vertical, 6)
            }

            // ── Controls ────────────────────────────────────────────
            HStack(spacing: 8) {
                if appState.isRunning {
                    Button("Stop") { appState.stop() }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                } else {
                    Button("Start") { Task { await appState.start() } }
                        .buttonStyle(.borderedProminent)
                }
                Spacer()
                Button("Settings") {
                    appState.showSettings()
                }
                    .buttonStyle(.borderless)
                Button("Quit") { NSApplication.shared.terminate(nil) }
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 10)
        }
        .frame(width: 300)
    }

    private var statusColor: Color {
        if appState.isConnected { return .green }
        if appState.isRunning   { return .yellow }
        return .red
    }
}
