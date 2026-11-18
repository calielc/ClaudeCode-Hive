import Foundation

enum SessionState: String {
    case working
    case waiting
    case ready
}

/// The groups below the open sessions in the left panel.
enum AgeGroup: Int, CaseIterable, Identifiable {
    case lastDay
    case older

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .lastDay: return "Last 24 hours"
        case .older: return "Older than 1 day"
        }
    }

    static func group(for age: TimeInterval) -> AgeGroup {
        age < 86400 ? .lastDay : .older
    }
}

/// A session that is open in a tab. The tab can belong to another folder than the one selected.
struct OpenTabRef {
    let id: String
    let folder: String
    let title: String
}

struct AgentInfo: Hashable {
    let id: String
    let description: String
    let model: String?
}

/// Extra facts for the cards of active sessions.
struct SessionDetails: Hashable {
    var model: String?
    var branch: String?
    var repo: String?
    var lastPrompt: String?
    var agents: [AgentInfo] = []
}

struct SessionInfo: Identifiable, Hashable {
    let id: String
    let title: String
    let modified: Date
    let state: SessionState
    let details: SessionDetails?
}

/// "claude-sonnet-5-5" becomes "Sonnet 5.5". "claude-opus-4-1-20250805" becomes "Opus 4.1".
func shortModelName(_ raw: String) -> String {
    let parts = raw.replacingOccurrences(of: "claude-", with: "").split(separator: "-").map(String.init)
    let family = parts.first { $0.allSatisfy(\.isLetter) } ?? raw
    let version = parts.filter { $0.allSatisfy(\.isNumber) && $0.count < 6 }.joined(separator: ".")
    let name = family.prefix(1).uppercased() + family.dropFirst()
    return version.isEmpty ? name : "\(name) \(version)"
}

func relativeAge(_ date: Date, now: Date = Date()) -> String {
    let seconds = max(0, Int(now.timeIntervalSince(date)))
    if seconds < 60 { return "now" }
    if seconds < 3600 { return "\(seconds / 60)m" }
    if seconds < 86400 { return "\(seconds / 3600)h" }
    return "\(seconds / 86400)d"
}
