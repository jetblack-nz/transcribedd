import Foundation

struct DownloadManager {
    /// Downloads the audio file at `urlString` to a temp location and returns the local URL.
    /// The caller is responsible for deleting the file when done.
    func download(from urlString: String) async throws -> URL {
        guard let remoteURL = URL(string: urlString) else {
            throw WorkerError.downloadFailed("Invalid URL: \(urlString)")
        }

        // Use a session that follows redirects and sends a browser-like User-Agent,
        // since some podcast CDNs reject non-browser requests.
        let config = URLSessionConfiguration.default
        config.httpAdditionalHeaders = [
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ]
        let session = URLSession(configuration: config)

        let (tmpURL, response) = try await session.download(from: remoteURL)

        guard let http = response as? HTTPURLResponse else {
            throw WorkerError.downloadFailed("No HTTP response for \(urlString)")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw WorkerError.downloadFailed("HTTP \(http.statusCode) for \(http.url?.absoluteString ?? urlString)")
        }

        // Move to a stable temp path with the right extension so whisper-cli can detect the format.
        // Use the final URL (after redirects) for the extension.
        let finalURL = http.url ?? remoteURL
        let ext = finalURL.pathExtension.components(separatedBy: "?").first ?? ""
        let cleanExt = ext.isEmpty ? "mp3" : ext
        let dest = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(cleanExt)

        try FileManager.default.moveItem(at: tmpURL, to: dest)
        return dest
    }
}
