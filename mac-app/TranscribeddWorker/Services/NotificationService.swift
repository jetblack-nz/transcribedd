import UserNotifications

enum NotificationService {
    static func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    static func jobCompleted(_ job: Job) {
        post(
            title: "Transcription Complete ✓",
            body: "\(job.episodeTitle) — \(job.podcastTitle)"
        )
    }

    static func jobFailed(_ job: Job, error: String) {
        post(
            title: "Transcription Failed",
            body: "\(job.episodeTitle): \(error)"
        )
    }

    private static func post(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body  = body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}
