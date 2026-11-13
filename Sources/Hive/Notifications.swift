import AppKit
import UserNotifications

/// Watches the status files that the hooks write, for every session, in any folder.
@MainActor
final class StatusMonitor {
    var onChange: ((_ id: String, _ old: SessionState?, _ new: SessionState) -> Void)?

    private var states: [String: SessionState] = [:]
    private var primed = false
    private var timer: Timer?
    private let directory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".claude-sessions/status")

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.poll() }
        }
        poll()
    }

    private func poll() {
        var current: [String: SessionState] = [:]
        for name in (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        where name.hasSuffix(".json") {
            guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let raw = json["state"] as? String, let state = SessionState(rawValue: raw)
            else { continue }
            current[String(name.dropLast(".json".count))] = state
        }
        // The first read is only a snapshot. It must not notify for old sessions.
        if primed {
            for (id, state) in current where states[id] != state { onChange?(id, states[id], state) }
        }
        states = current
        primed = true
    }
}

/// Sends macOS notifications. A notification needs a real app bundle, so a plain
/// `dev.sh` run falls back to `osascript`.
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    var onOpen: ((String) -> Void)?
    private let hasBundle = Bundle.main.bundleIdentifier != nil

    func setUp() {
        guard hasBundle else { return }
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func send(id: String, title: String, body: String) {
        guard hasBundle else { return sendWithScript(title: title, body: body) }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = ["sessionId": id]
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        )
    }

    private func sendWithScript(title: String, body: String) {
        func quoted(_ text: String) -> String {
            "\"" + text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", "display notification \(quoted(body)) with title \(quoted(title))"]
        try? process.run()
    }

    // Clicking a notification selects its session.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let id = response.notification.request.content.userInfo["sessionId"] as? String
        DispatchQueue.main.async { if let id { self.onOpen?(id) } }
        completionHandler()
    }
}
