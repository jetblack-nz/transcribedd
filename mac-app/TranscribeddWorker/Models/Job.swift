import Foundation

struct Job: Codable, Identifiable {
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
        case userId = "user_id"
        case podcastTitle = "podcast_title"
        case episodeTitle = "episode_title"
        case episodeUrl = "episode_url"
        case status
        case transcriptPath = "transcript_path"
        case workerId = "worker_id"
        case createdAt = "created_at"
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case errorMessage = "error_message"
    }
}

enum JobStatus: String, Codable {
    case pending
    case processing
    case completed
    case failed
}
