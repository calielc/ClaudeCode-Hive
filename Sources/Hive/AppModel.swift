import SwiftUI
import AppKit
import Combine

enum LayoutMode: String, CaseIterable, Identifiable {
    case single
    case sideBySide
    case stacked
    case grid

    var id: String { rawValue }

    var capacity: Int {
        switch self {
        case .single: return 1
        case .sideBySide, .stacked: return 2
        case .grid: return 4
        }
    }

    var title: String {
        switch self {
        case .single: return "Single"
        case .sideBySide: return "Side by side"
        case .stacked: return "Stacked"
        case .grid: return "Grid (2×2)"
        }
    }

    var symbol: String {
        switch self {
        case .single: return "rectangle"
        case .sideBySide: return "rectangle.split.2x1"
        case .stacked: return "rectangle.split.1x2"
        case .grid: return "rectangle.split.2x2"
        }
    }
}

/// Re-docks a tab when the user closes its separate window.
final class DetachedWindowDelegate: NSObject, NSWindowDelegate {
    let onClose: () -> Void
    init(onClose: @escaping () -> Void) { self.onClose = onClose }
    func windowWillClose(_ notification: Notification) { onClose() }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var folders: [String]
    @Published var selectedFolder: String { didSet { folderChanged() } }
    @Published var tabs: [TerminalTab] = []
    @Published var selectedTabId: String? { didSet { scheduleFocus(force: true) } }
    @Published var theme: TerminalTheme {
        didSet {
            UserDefaults.standard.set(theme.name, forKey: "terminalTheme")
            tabs.forEach { $0.apply(theme) }
        }
    }
    @Published var store: SessionStore
    @Published var layout: LayoutMode {
        didSet {
            UserDefaults.standard.set(layout.rawValue, forKey: "layout")
            // When the layout shrinks, the active pane's session moves to the first pane.
            if activePane >= layout.capacity {
                slots.swapAt(activePane, 0)
                activePane = 0
            }
            normalizeSlots()
            scheduleFocus(force: true)
        }
    }
    @Published private(set) var detachedIds: Set<String> = []
    /// Sessions selected in the left panel (for opening and deleting).
    @Published var selection: Set<String> = []
    /// Which session shows in which pane (up to 4 panes). Panes past the layout's capacity are empty.
    @Published private(set) var slots: [String?] = [nil, nil, nil, nil]
    /// The pane that gets the next session you pick. It has the blue border.
    @Published private(set) var activePane = 0
    @Published var dropTarget: Int?
    @Published private var tags: [String: String] =
        UserDefaults.standard.dictionary(forKey: "sessionTags") as? [String: String] ?? [:]

    let usage = UsageStore()
    private let monitor = StatusMonitor()
    private let notifier = Notifier()
    private var storeObserver: AnyCancellable?
    private var windows: [String: NSWindow] = [:]
    private var delegates: [String: DetachedWindowDelegate] = [:]

    private let foldersKey = "folders"
    private let selectedKey = "selectedFolder"

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let saved = UserDefaults.standard.stringArray(forKey: foldersKey) ?? ["\(home)/code"]
        let selected = UserDefaults.standard.string(forKey: selectedKey) ?? saved[0]
        folders = saved
        theme = TerminalTheme.named(UserDefaults.standard.string(forKey: "terminalTheme"))
        selectedFolder = selected
        store = SessionStore(folder: selected)
        layout = LayoutMode(rawValue: UserDefaults.standard.string(forKey: "layout") ?? "") ?? .single

        // Keep tab titles equal to the session names, so /rename shows up in the tabs.
        storeObserver = store.$sessions.sink { [weak self] sessions in
            MainActor.assumeIsolated { self?.syncTitles(sessions) }
        }

        // Typing must work right away: after Alt-Tab back to Hive, or when another window of Hive
        // becomes the key window, the terminal gets the keyboard focus.
        NotificationCenter.default.addObserver(
            forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in MainActor.assumeIsolated { self?.scheduleFocus(force: false) } }
        NotificationCenter.default.addObserver(
            forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main
        ) { [weak self] note in
            MainActor.assumeIsolated {
                guard let self, let window = note.object as? NSWindow else { return }
                // An undocked window selects its own session. The main window keeps the selected one.
                if let tab = self.tabs.first(where: { self.windows[$0.id] === window }) {
                    self.selectedTabId = tab.id
                } else {
                    self.scheduleFocus(force: false)
                }
            }
        }

        notifier.setUp()
        notifier.onOpen = { [weak self] id in
            MainActor.assumeIsolated { self?.reveal(id) }
        }
        monitor.onChange = { [weak self] id, old, new in
            MainActor.assumeIsolated { self?.statusChanged(id: id, old: old, new: new) }
        }
        monitor.start()

        // A click inside a terminal does not reach SwiftUI, so find the clicked terminal here.
        NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            MainActor.assumeIsolated { self?.focusTab(at: event) }
            return event
        }
    }

    private func syncTitles(_ sessions: [SessionInfo]) {
        var changed = false
        for tab in tabs {
            guard let session = sessions.first(where: { $0.id == tab.id }),
                  session.title != tab.title else { continue }
            tab.title = session.title
            windows[tab.id]?.title = session.title
            changed = true
        }
        if changed { objectWillChange.send() }
    }

    // MARK: Keyboard focus

    /// The view is not in its window yet right after a tab or layout change, so try a few times.
    /// `force` is false when the app comes back to the front: then a search field in use keeps the focus.
    private func scheduleFocus(force: Bool) {
        for delay in [0.0, 0.08, 0.3] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                MainActor.assumeIsolated { self?.focusTerminal(force: force) }
            }
        }
    }

    private func focusTerminal(force: Bool) {
        guard let key = NSApplication.shared.keyWindow else { return }
        // The selected tab, when it is in the key window. Otherwise the tab of that window.
        let tab = selectedTab.flatMap { $0.view.window === key ? $0 : nil }
            ?? tabs.first { $0.view.window === key }
        guard let tab else { return }
        if !force, key.firstResponder is NSTextView { return }
        if key.firstResponder !== tab.view { key.makeFirstResponder(tab.view) }
    }

    // MARK: Notifications

    private func statusChanged(id: String, old: SessionState?, new: SessionState) {
        guard !NSApplication.shared.isActive, let tab = tabs.first(where: { $0.id == id }) else { return }
        if new == .waiting, old != .waiting {
            notifier.send(id: id, title: tab.title, body: "Needs your input")
        } else if new == .ready, old == .working {
            notifier.send(id: id, title: tab.title, body: "Finished")
        }
    }

    private func reveal(_ id: String) {
        guard let tab = tabs.first(where: { $0.id == id }) else { return }
        NSApplication.shared.activate(ignoringOtherApps: true)
        selectedTabId = id
        if detachedIds.contains(id) { focusDetached(tab) }
    }

    private func focusTab(at event: NSEvent) {
        guard let content = event.window?.contentView,
              var view = content.hitTest(content.convert(event.locationInWindow, from: nil))
        else { return }
        while true {
            if let tab = tabs.first(where: { $0.view === view }) {
                if let index = slots.firstIndex(of: tab.id) { activePane = index }
                selectedTabId = tab.id
                return
            }
            guard let parent = view.superview else { return }
            view = parent
        }
    }

    // MARK: Colour tags

    func tag(for id: String) -> SessionTag? {
        tags[id].flatMap(SessionTag.init(rawValue:))
    }

    func setTag(_ tag: SessionTag?, for id: String) {
        tags[id] = tag?.rawValue
        UserDefaults.standard.set(tags, forKey: "sessionTags")
    }

    // MARK: Layout

    var dockedTabs: [TerminalTab] { tabs.filter { !detachedIds.contains($0.id) } }

    func tab(inPane index: Int) -> TerminalTab? {
        guard index < slots.count, let id = slots[index] else { return nil }
        return tabs.first { $0.id == id }
    }

    /// Click on a pane: it becomes the target for the next session you pick.
    func selectPane(_ index: Int) {
        guard index < layout.capacity else { return }
        activePane = index
        selectedTabId = slots[index]
    }

    /// Puts a tab in a pane. A tab that is already in another pane swaps places with this pane's tab.
    func show(_ tab: TerminalTab, inPane index: Int) {
        guard !detachedIds.contains(tab.id), index < layout.capacity else { return }
        if let from = slots.firstIndex(of: tab.id), from != index { slots[from] = slots[index] }
        slots[index] = tab.id
        activePane = index
        normalizeSlots()
        if selectedTabId != tab.id { selectedTabId = tab.id }
    }

    /// Click on a tab in the tab bar: it goes into the active pane.
    func activate(_ tab: TerminalTab) {
        if detachedIds.contains(tab.id) {
            selectedTabId = tab.id
            focusDetached(tab)
        } else {
            show(tab, inPane: activePane)
        }
    }

    /// A session or tab dropped on a pane.
    func drop(_ ids: [String], inPane index: Int) -> Bool {
        dropTarget = nil
        guard let id = ids.first, index < layout.capacity else { return false }
        activePane = index
        if let tab = tabs.first(where: { $0.id == id }) {
            if detachedIds.contains(id) { dock(tab) } else { show(tab, inPane: index) }
            return true
        }
        if let session = store.sessions.first(where: { $0.id == id }) {
            open(session)
            return true
        }
        return false
    }

    /// Keeps the panes consistent: no closed or undocked tab in a pane, no tab twice,
    /// and no empty pane while a docked tab is hidden.
    private func normalizeSlots() {
        let docked = dockedTabs.map(\.id)
        var next = [String?](repeating: nil, count: 4)
        var used = Set<String>()
        for index in 0..<layout.capacity {
            if let id = slots[index], docked.contains(id), !used.contains(id) {
                next[index] = id
                used.insert(id)
            }
        }
        for index in 0..<layout.capacity where next[index] == nil {
            if let id = docked.first(where: { !used.contains($0) }) {
                next[index] = id
                used.insert(id)
            }
        }
        if next != slots { slots = next }
        activePane = min(activePane, layout.capacity - 1)
        if selectedTabId == nil || !tabs.contains(where: { $0.id == selectedTabId }) {
            selectedTabId = slots[activePane] ?? slots.compactMap { $0 }.first
        }
    }

    // MARK: Undock and dock

    func detach(_ tab: TerminalTab) {
        guard windows[tab.id] == nil else { windows[tab.id]?.makeKeyAndOrderFront(nil); return }
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered, defer: false
        )
        window.title = tab.title
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: DetachedView(tab: tab).environmentObject(self))
        let delegate = DetachedWindowDelegate { [weak self] in
            MainActor.assumeIsolated { self?.finishDock(tab.id) }
        }
        window.delegate = delegate
        delegates[tab.id] = delegate
        windows[tab.id] = window
        detachedIds.insert(tab.id)
        normalizeSlots()

        // Open on another display when there is one.
        if let other = NSScreen.screens.first(where: { $0 != NSScreen.main }) ?? NSScreen.main {
            center(window, on: other)
        }
        window.makeKeyAndOrderFront(nil)
    }

    func dock(_ tab: TerminalTab) {
        windows[tab.id]?.close()   // the delegate then calls finishDock
    }

    private func finishDock(_ id: String) {
        windows[id]?.delegate = nil
        windows[id] = nil
        delegates[id] = nil
        detachedIds.remove(id)
        guard let tab = tabs.first(where: { $0.id == id }), !tab.isClosing else { return }
        normalizeSlots()
        // Back in the main window: into an empty pane, or else into the active pane.
        if slots.contains(id) { selectedTabId = id } else { show(tab, inPane: activePane) }
    }

    func moveToNextDisplay(_ tab: TerminalTab) {
        guard let window = windows[tab.id] else { return }
        let screens = NSScreen.screens
        guard screens.count > 1 else { return }
        let index = screens.firstIndex(of: window.screen ?? screens[0]) ?? 0
        center(window, on: screens[(index + 1) % screens.count])
    }

    private func center(_ window: NSWindow, on screen: NSScreen) {
        let frame = screen.visibleFrame
        let size = window.frame.size
        window.setFrameOrigin(NSPoint(x: frame.midX - size.width / 2, y: frame.midY - size.height / 2))
    }

    func focusDetached(_ tab: TerminalTab) {
        windows[tab.id]?.makeKeyAndOrderFront(nil)
    }

    private func folderChanged() {
        UserDefaults.standard.set(selectedFolder, forKey: selectedKey)
        store.folder = selectedFolder
        store.refresh()
    }

    func addFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.prompt = "Add Folder"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        if !folders.contains(url.path) { folders.append(url.path) }
        UserDefaults.standard.set(folders, forKey: foldersKey)
        selectedFolder = url.path
    }

    func removeFolder(_ folder: String) {
        guard folders.count > 1 else { return }
        folders.removeAll { $0 == folder }
        UserDefaults.standard.set(folders, forKey: foldersKey)
        if selectedFolder == folder { selectedFolder = folders[0] }
    }

    func newSession() {
        let id = UUID().uuidString.lowercased()
        open(TerminalTab(sessionId: id, title: "New Session", folder: selectedFolder, resume: false, theme: theme))
    }

    func open(ids: Set<String>) {
        // Several sessions at once go into successive panes, so they do not replace each other.
        var first = true
        for session in store.sessions where ids.contains(session.id) {
            if !first { activePane = (activePane + 1) % layout.capacity }
            first = false
            open(session)
        }
    }

    // MARK: Delete

    /// Asks first, then moves the session files to the Trash. Nothing is erased for good.
    func requestDelete(_ ids: Set<String>) {
        let chosen = store.sessions.filter { ids.contains($0.id) }
        guard !chosen.isEmpty else { return }
        let working = chosen.filter { $0.state == .working }.count
        let open = chosen.filter { session in tabs.contains { $0.id == session.id } }.count

        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = chosen.count == 1
            ? "Move “\(chosen[0].title)” to the Trash?"
            : "Move \(chosen.count) sessions to the Trash?"
        var details = "The session files go to the Trash. You can put them back from there."
        if open > 0 { details += "\n\(open) open in a tab. The tab closes and the session stops." }
        if working > 0 { details += "\n\(working) working right now." }
        alert.informativeText = details
        alert.addButton(withTitle: "Move to Trash").hasDestructiveAction = true
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        var failed: [String] = []
        let directory = SessionScanner.projectDirectory(for: selectedFolder)
        let statusDirectory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".claude-sessions/status")
        for session in chosen {
            if let tab = tabs.first(where: { $0.id == session.id }) { close(tab) }
            // The transcript, and the folder with the sub agent transcripts when there is one.
            for url in [directory.appendingPathComponent("\(session.id).jsonl"),
                        directory.appendingPathComponent(session.id)]
            where FileManager.default.fileExists(atPath: url.path) {
                do { try FileManager.default.trashItem(at: url, resultingItemURL: nil) }
                catch { failed.append(session.title) }
            }
            try? FileManager.default.removeItem(at: statusDirectory.appendingPathComponent("\(session.id).json"))
            setTag(nil, for: session.id)
        }
        selection = []
        store.refresh()

        if !failed.isEmpty {
            let error = NSAlert()
            error.alertStyle = .critical
            error.messageText = "Could not move \(failed.count) session(s) to the Trash"
            error.informativeText = failed.joined(separator: "\n")
            error.runModal()
        }
    }

    func open(_ session: SessionInfo) {
        if let tab = tabs.first(where: { $0.id == session.id }) {
            activate(tab)
            return
        }
        open(TerminalTab(sessionId: session.id, title: session.title, folder: selectedFolder, resume: true, theme: theme))
    }

    private func open(_ tab: TerminalTab) {
        // /exit or Ctrl+D in the terminal closes the tab.
        tab.onExit = { [weak self, weak tab] in
            MainActor.assumeIsolated { if let self, let tab { self.close(tab) } }
        }
        tabs.append(tab)
        show(tab, inPane: activePane)
    }

    func close(_ tab: TerminalTab) {
        tab.close()
        if detachedIds.contains(tab.id) { dock(tab) }
        tabs.removeAll { $0.id == tab.id }
        if selectedTabId == tab.id { selectedTabId = nil }
        normalizeSlots()
    }

    var selectedTab: TerminalTab? { tabs.first { $0.id == selectedTabId } }
}
