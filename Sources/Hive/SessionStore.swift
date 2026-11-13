import Foundation
import SwiftUI

/// Lists the Claude Code sessions of one folder and their live state.
/// The files are read in the background, so the window never waits for them.
@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var sessions: [SessionInfo] = []
    @Published private(set) var isLoading = true
    @Published var folder: String { didSet { activeOrder = [] } }
    @Published var query = "" { didSet { updateSearch() } }
    @Published private(set) var contentMatches: Set<String> = []
    @Published private(set) var isSearching = false
    private var searchTask: Task<Void, Never>?

    /// The order of the active tiles. A tile keeps its place while it writes. A session that
    /// becomes active enters at the top, and a tile that leaves the group drops out.
    private var activeOrder: [String] = []

    private let scanner = SessionScanner()
    private var scanning = false
    private var scanAgain = false
    private var timer: Timer?

    init(folder: String) {
        self.folder = folder
        timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        refresh()
    }

    func refresh() {
        if scanning { scanAgain = true; return }
        scanning = true
        let folder = self.folder
        Task {
            let result = await scanner.scan(folder: folder)
            scanning = false
            if folder == self.folder {   // drop the result when the folder changed meanwhile
                updateActiveOrder(result)
                if result != sessions { sessions = result }
                isLoading = false
            }
            if scanAgain { scanAgain = false; refresh() }
        }
    }

    /// `sessions` is sorted by last activity, newest first.
    private func updateActiveOrder(_ sessions: [SessionInfo], now: Date = Date()) {
        let active = sessions.filter { AgeGroup.group(for: now.timeIntervalSince($0.modified)) == .active }
        let activeIds = Set(active.map(\.id))
        activeOrder.removeAll { !activeIds.contains($0) }
        let known = Set(activeOrder)
        activeOrder = active.map(\.id).filter { !known.contains($0) } + activeOrder
    }

    func grouped(now: Date = Date()) -> [(group: AgeGroup, sessions: [SessionInfo])] {
        let rank = Dictionary(uniqueKeysWithValues: activeOrder.enumerated().map { ($1, $0) })
        return AgeGroup.allCases.compactMap { group in
            var items = sessions.filter { AgeGroup.group(for: now.timeIntervalSince($0.modified)) == group }
            if group == .active {
                // Stable order. Sorting by last activity makes the tiles jump on every write.
                items.sort { (rank[$0.id] ?? Int.max) < (rank[$1.id] ?? Int.max) }
            }
            return items.isEmpty ? nil : (group, items)
        }
    }

    // MARK: Search

    var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Sessions whose name matches come first. Then come sessions that only match inside the conversation.
    func searchResults() -> [(session: SessionInfo, inConversationOnly: Bool)] {
        let text = trimmedQuery
        guard !text.isEmpty else { return [] }
        let named = sessions.filter { $0.title.localizedCaseInsensitiveContains(text) || $0.id.hasPrefix(text.lowercased()) }
        let namedIds = Set(named.map(\.id))
        let inside = sessions.filter { contentMatches.contains($0.id) && !namedIds.contains($0.id) }
        return named.map { ($0, false) } + inside.map { ($0, true) }
    }

    private func updateSearch() {
        searchTask?.cancel()
        let text = trimmedQuery
        guard text.count >= 2 else { contentMatches = []; isSearching = false; return }
        isSearching = true
        let folder = self.folder
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)   // wait while the user types
            if Task.isCancelled { return }
            let ids = await Task.detached { SessionScanner.sessionIdsContaining(text, folder: folder) }.value
            if Task.isCancelled { return }
            contentMatches = ids
            isSearching = false
        }
    }

    /// Only sessions of the last day count, so old sessions do not fill the numbers.
    func count(of state: SessionState, now: Date = Date()) -> Int {
        sessions.filter { $0.state == state && now.timeIntervalSince($0.modified) < 86400 }.count
    }
}

/// Reads the session files. It is an actor, so it runs off the main thread and its caches are safe.
actor SessionScanner {
    private var titleCache: [String: (modified: Date, title: String)] = [:]
    private var detailCache: [String: (modified: Date, details: SessionDetails)] = [:]
    private var agentModelCache: [String: (modified: Date, model: String?)] = [:]
    private let statusDir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".claude-sessions/status")

    /// Claude Code names a project directory after the path, with "/" and "." turned into "-".
    static func projectDirectory(for folder: String) -> URL {
        let encoded = folder.map { $0 == "/" || $0 == "." ? "-" : String($0) }.joined()
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".claude/projects/\(encoded)")
    }

    /// Full text search over the transcripts, with the system `grep`. It finds the words
    /// the user typed and the answers, and also what sub agents did.
    nonisolated static func sessionIdsContaining(_ text: String, folder: String) -> Set<String> {
        let directory = projectDirectory(for: folder)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/grep")
        process.arguments = ["-r", "-l", "-i", "-F", "--include=*.jsonl", "-e", text, directory.path]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        guard (try? process.run()) != nil else { return [] }
        let output = pipe.fileHandleForReading.readDataToEndOfFile()   // read before waiting, or a big output blocks
        process.waitUntilExit()

        var ids = Set<String>()
        for line in String(decoding: output, as: UTF8.self).split(separator: "\n") {
            // A hit is <folder>/<id>.jsonl or <folder>/<id>/subagents/<agent>.jsonl
            let relative = line.dropFirst(directory.path.count + 1)
            guard let first = relative.split(separator: "/").first else { continue }
            ids.insert(first.hasSuffix(".jsonl") ? String(first.dropLast(".jsonl".count)) : String(first))
        }
        return ids
    }

    func scan(folder: String) -> [SessionInfo] {
        let directory = Self.projectDirectory(for: folder)
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        )) ?? []

        var result: [SessionInfo] = []
        for file in files where file.pathExtension == "jsonl" {
            let id = file.deletingPathExtension().lastPathComponent
            let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate ?? .distantPast
            let isActive = AgeGroup.group(for: Date().timeIntervalSince(modified)) == .active
            result.append(SessionInfo(
                id: id,
                title: title(for: file, id: id, modified: modified),
                modified: modified,
                state: state(for: id),
                details: isActive ? details(for: file, id: id, directory: directory, modified: modified) : nil
            ))
        }
        result.sort { $0.modified > $1.modified }
        return result
    }

    private func state(for id: String) -> SessionState {
        let file = statusDir.appendingPathComponent("\(id).json")
        guard let data = try? Data(contentsOf: file),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let raw = json["state"] as? String,
              let state = SessionState(rawValue: raw)
        else { return .ready }
        return state
    }

    // MARK: Details for the cards

    private func details(for file: URL, id: String, directory: URL, modified: Date) -> SessionDetails {
        var details: SessionDetails
        if let cached = detailCache[id], cached.modified == modified {
            details = cached.details
        } else {
            details = readDetails(file)
            detailCache[id] = (modified, details)
        }
        // Agents finish without touching the main transcript, so read them every time.
        details.agents = runningAgents(sessionDirectory: directory.appendingPathComponent(id))
        return details
    }

    /// The name of the git repository that holds the working directory. A session can run in a
    /// sub folder, so walk up to the folder that has `.git`. Without one, use the folder's own name.
    nonisolated static func repoName(forWorkingDirectory cwd: String) -> String {
        var url = URL(fileURLWithPath: cwd)
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        while url.path != "/" && url.path != home {
            if FileManager.default.fileExists(atPath: url.appendingPathComponent(".git").path) {
                return url.lastPathComponent
            }
            url.deleteLastPathComponent()
        }
        return URL(fileURLWithPath: cwd).lastPathComponent
    }

    private func tailLines(_ file: URL, bytes: UInt64) -> [Substring] {
        guard let handle = try? FileHandle(forReadingFrom: file) else { return [] }
        defer { try? handle.close() }
        let size = (try? handle.seekToEnd()) ?? 0
        try? handle.seek(toOffset: size > bytes ? size - bytes : 0)
        let text = String(decoding: (try? handle.readToEnd()) ?? Data(), as: UTF8.self)
        return text.split(separator: "\n")
    }

    private func readDetails(_ file: URL) -> SessionDetails {
        var details = SessionDetails()
        for line in tailLines(file, bytes: 512 * 1024).reversed() {
            guard let data = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { continue }
            if details.branch == nil, let branch = json["gitBranch"] as? String, !branch.isEmpty {
                details.branch = branch
            }
            if details.lastPrompt == nil, json["type"] as? String == "last-prompt",
               let prompt = json["lastPrompt"] as? String {
                details.lastPrompt = prompt
            }
            if details.repo == nil, let cwd = json["cwd"] as? String, !cwd.isEmpty {
                details.repo = Self.repoName(forWorkingDirectory: cwd)
            }
            if details.model == nil, json["type"] as? String == "assistant",
               let message = json["message"] as? [String: Any],
               let model = message["model"] as? String, !model.hasPrefix("<") {
                details.model = model
            }
            if details.model != nil, details.branch != nil, details.lastPrompt != nil, details.repo != nil { break }
        }
        return details
    }

    /// A background agent has a meta file with "finished": true when it is done.
    /// An agent whose transcript was quiet for 15 minutes counts as stale, not running.
    private func runningAgents(sessionDirectory: URL) -> [AgentInfo] {
        let directory = sessionDirectory.appendingPathComponent("subagents")
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        var agents: [AgentInfo] = []
        for name in names where name.hasSuffix(".meta.json") {
            let agentId = String(name.dropLast(".meta.json".count))
            let transcript = directory.appendingPathComponent("\(agentId).jsonl")
            guard let modified = (try? transcript.resourceValues(forKeys: [.contentModificationDateKey]))?
                    .contentModificationDate,
                  Date().timeIntervalSince(modified) < 900,
                  let data = try? Data(contentsOf: directory.appendingPathComponent(name)),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  json["finished"] as? Bool != true
            else { continue }
            agents.append(AgentInfo(
                id: agentId,
                description: json["description"] as? String ?? (json["agentType"] as? String ?? "Agent"),
                model: agentModel(transcript, modified: modified)
            ))
        }
        return agents.sorted { $0.id < $1.id }
    }

    private func agentModel(_ transcript: URL, modified: Date) -> String? {
        let key = transcript.path
        if let cached = agentModelCache[key], cached.modified == modified { return cached.model }
        var model: String?
        for line in tailLines(transcript, bytes: 64 * 1024).reversed() where line.contains("\"model\"") {
            if let data = line.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = json["message"] as? [String: Any],
               let value = message["model"] as? String, !value.hasPrefix("<") {
                model = value
                break
            }
        }
        agentModelCache[key] = (modified, model)
        return model
    }

    // MARK: Titles

    private func title(for file: URL, id: String, modified: Date) -> String {
        if let cached = titleCache[id], cached.modified == modified { return cached.title }
        let title = readTitle(file) ?? "New Session"
        titleCache[id] = (modified, title)
        return title
    }

    private func readTitle(_ file: URL) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: file) else { return nil }
        defer { try? handle.close() }
        let size = (try? handle.seekToEnd()) ?? 0

        // Titles are written again and again, so the end of the file has the latest.
        // Read a small tail first. Most sessions have a title there, and 700 big reads are slow.
        for chunk: UInt64 in [64 * 1024, 512 * 1024] {
            try? handle.seek(toOffset: size > chunk ? size - chunk : 0)
            let tail = String(decoding: (try? handle.readToEnd()) ?? Data(), as: UTF8.self)
            var custom: String?
            var ai: String?
            for line in tail.split(separator: "\n") {
                if line.contains("\"custom-title\""), let value = field("customTitle", in: line) { custom = value }
                else if line.contains("\"ai-title\""), let value = field("aiTitle", in: line) { ai = value }
            }
            if let custom, !custom.isEmpty { return custom }
            if let ai, !ai.isEmpty { return ai }
            if size <= chunk { break }
        }

        // Fall back to the first user message.
        try? handle.seek(toOffset: 0)
        let head = String(decoding: handle.readData(ofLength: 512 * 1024), as: UTF8.self)
        for line in head.split(separator: "\n") where line.contains("\"type\":\"user\"") {
            guard let data = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let message = json["message"] as? [String: Any]
            else { continue }
            if let text = message["content"] as? String { return String(text.prefix(60)) }
            if let parts = message["content"] as? [[String: Any]],
               let text = parts.first(where: { $0["type"] as? String == "text" })?["text"] as? String {
                return String(text.prefix(60))
            }
        }
        return nil
    }

    private func field(_ name: String, in line: Substring) -> String? {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return json[name] as? String
    }
}
