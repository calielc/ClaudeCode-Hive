import SwiftUI

struct UsageWindow: Hashable, Identifiable {
    let label: String
    let percent: Double?
    let resetsAt: Date?
    var id: String { label }
}

struct UsageSnapshot: Hashable {
    let windows: [UsageWindow]
    let updatedAt: Date
}

/// Reads ~/.claude-sessions/usage.json, which the status line wrapper keeps current
/// while at least one Claude Code session is open.
@MainActor
final class UsageStore: ObservableObject {
    @Published private(set) var snapshot: UsageSnapshot?
    private var timer: Timer?
    private let file = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".claude-sessions/usage.json")

    init() {
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        refresh()
    }

    func refresh() {
        guard let data = try? Data(contentsOf: file),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { snapshot = nil; return }

        var windows: [UsageWindow] = []
        if let window = parse("5 hours", json["five_hour"], percentKey: "used_percentage") { windows.append(window) }
        if let window = parse("Week", json["seven_day"], percentKey: "used_percentage") { windows.append(window) }
        for case let scoped as [String: Any] in (json["model_scoped"] as? [Any]) ?? [] {
            let name = scoped["display_name"] as? String ?? "Model"
            if let window = parse("Week \(name)", scoped, percentKey: "utilization") { windows.append(window) }
        }
        let updated = Date(timeIntervalSince1970: json["updated_at"] as? Double ?? 0)
        let next = UsageSnapshot(windows: windows, updatedAt: updated)
        if next != snapshot { snapshot = next }
    }

    /// resets_at is seconds since 1970, or an ISO 8601 text for model windows.
    private func parse(_ label: String, _ raw: Any?, percentKey: String) -> UsageWindow? {
        guard let dictionary = raw as? [String: Any] else { return nil }
        let percent = dictionary[percentKey] as? Double
        var reset: Date?
        if let seconds = dictionary["resets_at"] as? Double, seconds > 0 {
            reset = Date(timeIntervalSince1970: seconds)
        } else if let text = dictionary["resets_at"] as? String {
            reset = ISO8601DateFormatter().date(from: text)
        }
        return percent == nil && reset == nil ? nil : UsageWindow(label: label, percent: percent, resetsAt: reset)
    }
}

struct UsageBars: View {
    @ObservedObject var store: UsageStore

    /// Always show both windows, so the footer is there before the first numbers arrive.
    private var windows: [UsageWindow] {
        if let windows = store.snapshot?.windows, !windows.isEmpty { return windows }
        return [UsageWindow(label: "5 hours", percent: nil, resetsAt: nil),
                UsageWindow(label: "Week", percent: nil, resetsAt: nil)]
    }

    var body: some View {
        // Redraw every 30 seconds so the countdowns stay current.
        TimelineView(.periodic(from: .now, by: 30)) { context in
            VStack(alignment: .leading, spacing: 5) {
                Text("Usage limits").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                ForEach(windows) { window in bar(window, now: context.date) }
                if let snapshot = store.snapshot {
                    if context.date.timeIntervalSince(snapshot.updatedAt) > 600 {
                        Text("Last update \(relativeAge(snapshot.updatedAt, now: context.date)) ago. It refreshes while a session is open.")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                } else {
                    Text("No data yet. Run scripts/install-hooks.py, then use a session.")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    private func bar(_ window: UsageWindow, now: Date) -> some View {
        // A window that has already reset has no known usage until the next update.
        let rolledOver = window.resetsAt.map { $0 < now } ?? false
        let percent = rolledOver ? nil : window.percent
        return HStack(spacing: 6) {
            Text(window.label).font(.caption2).frame(width: 62, alignment: .leading).lineLimit(1)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.gray.opacity(0.2))
                    Capsule().fill(color(percent))
                        .frame(width: geometry.size.width * CGFloat(min(max(percent ?? 0, 0), 100) / 100))
                }
            }
            .frame(height: 6)
            Text(percent.map { "\(Int($0.rounded()))%" } ?? "–")
                .font(.caption2.monospacedDigit()).frame(width: 34, alignment: .trailing)
            Text(rolledOver ? "reset" : countdown(window.resetsAt, now: now))
                .font(.caption2).foregroundStyle(.secondary).frame(width: 52, alignment: .trailing)
        }
    }

    private func color(_ percent: Double?) -> Color {
        guard let percent else { return .gray }
        if percent >= 85 { return .red }
        if percent >= 60 { return .orange }
        return .green
    }

    private func countdown(_ date: Date?, now: Date) -> String {
        guard let date else { return "" }
        let minutes = max(0, Int(date.timeIntervalSince(now) / 60))
        if minutes < 60 { return "\(minutes)m" }
        if minutes < 1440 { return "\(minutes / 60)h \(minutes % 60)m" }
        return "\(minutes / 1440)d \(minutes % 1440 / 60)h"
    }
}
