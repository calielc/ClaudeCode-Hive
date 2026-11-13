import SwiftUI

struct ContentView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        HSplitView {
            // The children must be flexible in height. Otherwise the split view keeps its
            // small ideal height and floats in the middle of the window.
            SidebarView()
                .frame(minWidth: 240, idealWidth: 320, maxWidth: 480, maxHeight: .infinity)
            DetailView()
                .frame(minWidth: 500, maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 900, minHeight: 500)
    }
}

struct SidebarView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            folderPicker
            SearchField(store: model.store)
            ProgressSummary(store: model.store)
            Divider().padding(.top, 8)
            SessionList(store: model.store)
                .frame(maxHeight: .infinity)
            Divider()
            UsageBars(store: model.usage)
                .padding(.bottom, 10)
        }
    }

    private var folderPicker: some View {
        HStack(spacing: 6) {
            Picker("Folder", selection: $model.selectedFolder) {
                ForEach(model.folders, id: \.self) { folder in
                    Text((folder as NSString).abbreviatingWithTildeInPath).tag(folder)
                }
            }
            .labelsHidden()
            .contextMenu {
                Button("Remove this folder") { model.removeFolder(model.selectedFolder) }
            }
            Button { model.addFolder() } label: { Image(systemName: "folder.badge.plus") }
                .help("Add Folder")
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
    }
}

/// The "what is going on" bar: how many sessions work, wait for you, or are ready.
struct ProgressSummary: View {
    @ObservedObject var store: SessionStore

    var body: some View {
        HStack(spacing: 14) {
            badge(.working, "Working")
            badge(.waiting, "Waiting for you")
            badge(.ready, "Ready")
        }
        .font(.caption)
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    private func badge(_ state: SessionState, _ label: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(state.color).frame(width: 8, height: 8)
            Text("\(store.count(of: state)) \(label)")
        }
    }
}

struct SearchField: View {
    @ObservedObject var store: SessionStore
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Search sessions", text: $store.query)
                .textFieldStyle(.plain)
                .focused($focused)
                .onExitCommand { store.query = "" }
            if store.isSearching { ProgressView().controlSize(.small) }
            if !store.query.isEmpty {
                Button { store.query = "" } label: { Image(systemName: "xmark.circle.fill") }
                    .buttonStyle(.plain).foregroundStyle(.secondary)
            }
            // ⌘F puts the cursor in the search field.
            Button("") { focused = true }
                .keyboardShortcut("f", modifiers: .command)
                .frame(width: 0, height: 0).opacity(0)
        }
        .padding(.horizontal, 8).padding(.vertical, 5)
        .background(RoundedRectangle(cornerRadius: 6).fill(Color.gray.opacity(0.15)))
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }
}

struct SessionList: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var store: SessionStore

    var body: some View {
        if !store.trimmedQuery.isEmpty {
            SearchResults(store: store)
        } else {
            groupedList
        }
    }

    private var groupedList: some View {
        // Redraw every 30 seconds so the ages and the groups stay current.
        TimelineView(.periodic(from: .now, by: 30)) { context in
            if store.isLoading {
                ProgressView("Loading sessions…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
            List(selection: $model.selection) {
                ForEach(store.grouped(now: context.date), id: \.group) { section in
                    Section(section.group.title) {
                        ForEach(section.sessions) { session in
                            let selected = model.selectedTabId == session.id
                            Group {
                                if section.group == .active {
                                    SessionCard(session: session, now: context.date, selected: selected)
                                        .listRowSeparator(.hidden)
                                } else {
                                    SessionRow(session: session, now: context.date, selected: selected)
                                }
                            }
                            .draggable(session.id)

                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .sessionActions(model)
            }
        }
    }
}

extension View {
    /// Right-click menu and keys for the selected sessions: Return or double-click opens,
    /// Delete moves them to the Trash.
    func sessionActions(_ model: AppModel) -> some View {
        contextMenu(forSelectionType: String.self) { ids in
            if !ids.isEmpty {
                SessionTagMenu(ids: Array(ids))
                Divider()
                Button("Move to Trash…", role: .destructive) { model.requestDelete(ids) }
            }
        } primaryAction: { ids in
            model.open(ids: ids)
        }
        .onDeleteCommand { model.requestDelete(model.selection) }
    }
}

struct SearchResults: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var store: SessionStore

    var body: some View {
        let results = store.searchResults()
        TimelineView(.periodic(from: .now, by: 30)) { context in
            if results.isEmpty {
                ContentUnavailableView(store.isSearching ? "Searching…" : "No session found",
                                       systemImage: "magnifyingglass",
                                       description: Text("Looks at the names and at the conversations in this folder."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(results, id: \.session.id, selection: $model.selection) { result in
                    SessionRow(session: result.session, now: context.date,
                               selected: model.selectedTabId == result.session.id,
                               note: result.inConversationOnly ? "found in the conversation" : nil)
                        .draggable(result.session.id)
                }
                .listStyle(.sidebar)
                .sessionActions(model)
            }
        }
    }
}

struct SessionRow: View {
    @EnvironmentObject var model: AppModel
    let session: SessionInfo
    let now: Date
    let selected: Bool
    var note: String?

    var body: some View {
        HStack {
            StateDot(state: session.state)
            VStack(alignment: .leading, spacing: 1) {
                Text(session.title).lineLimit(1)
                if let note { Text(note).font(.caption2).foregroundStyle(.secondary) }
            }
            Spacer()
            Text(relativeAge(session.modified, now: now))
                .foregroundStyle(.secondary)
                .font(.caption)
        }
        .padding(.vertical, 2)
        .background(model.tag(for: session.id)?.color.opacity(0.16) ?? .clear)
        .background(selected ? Color.accentColor.opacity(0.18) : .clear)
        .tagStripe(model.tag(for: session.id))
    }
}

/// A bigger tile for an active session: state, model, branch, running agents and the last prompt.
struct SessionCard: View {
    @EnvironmentObject var model: AppModel
    let session: SessionInfo
    let now: Date
    let selected: Bool

    var body: some View {
        let details = session.details
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                StateDot(state: session.state)
                Text(session.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                Spacer()
                Text(relativeAge(session.modified, now: now))
                    .font(.caption).foregroundStyle(.secondary)
            }
            // Where the session works: the repo and the branch get the full width.
            HStack(spacing: 6) {
                if let repo = details?.repo { chip(repo, "folder", truncation: .middle) }
                if let branch = details?.branch { chip(branch, "arrow.triangle.branch", truncation: .middle) }
            }
            HStack(spacing: 6) {
                if let model = details?.model { chip(shortModelName(model), "cpu") }
                let count = details?.agents.count ?? 0
                chip(count == 1 ? "1 agent" : "\(count) agents", "person.2", highlight: count > 0)
            }
            ForEach(details?.agents ?? [], id: \.id) { agent in
                HStack(spacing: 4) {
                    Image(systemName: "circle.fill").font(.system(size: 5)).foregroundStyle(.orange)
                    Text(agent.description).lineLimit(1)
                    if let model = agent.model {
                        Text("· \(shortModelName(model))").foregroundStyle(.secondary)
                    }
                }
                .font(.caption)
            }
            if let prompt = details?.lastPrompt {
                Text(prompt).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10)
            .fill(model.tag(for: session.id)?.color.opacity(0.2) ?? Color.gray.opacity(0.12)))
        .tagStripe(model.tag(for: session.id), inset: 8)
        .shadow(color: .black.opacity(0.22), radius: 4, y: 2)
        .overlay(RoundedRectangle(cornerRadius: 10)
            .stroke(selected ? Color.accentColor : session.state.color.opacity(0.35), lineWidth: selected ? 2 : 1))
        .padding(.vertical, 2)
    }

    private func chip(_ text: String, _ symbol: String, highlight: Bool = false,
                      truncation: Text.TruncationMode = .tail) -> some View {
        HStack(spacing: 3) {
            Image(systemName: symbol)
            Text(text).lineLimit(1).truncationMode(truncation)
        }
        .font(.caption2)
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(Capsule().fill(highlight ? Color.orange.opacity(0.25) : Color.gray.opacity(0.18)))
    }
}

struct StateDot: View {
    let state: SessionState

    var body: some View {
        if state == .working {
            // No @State here: the macro plugin for it only ships with full Xcode.
            TimelineView(.animation(minimumInterval: 0.1)) { context in
                let phase = sin(context.date.timeIntervalSinceReferenceDate * 4)
                dot.opacity(0.65 + 0.35 * phase)
            }
        } else {
            dot
        }
    }

    private var dot: some View {
        Circle().fill(state.color).frame(width: 9, height: 9)
    }
}

extension SessionState {
    var color: Color {
        switch self {
        case .working: return .orange
        case .waiting: return .red
        case .ready: return .green
        }
    }
}

struct DetailView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { model.newSession() } label: { Label("New Session", systemImage: "plus") }
                    .help("New session in the selected folder (⌘N)")
                    .padding(.leading, 8)
                if !model.tabs.isEmpty { TabBar() }
                Spacer()
                Menu {
                    ForEach(TerminalTheme.all) { theme in
                        Button { model.theme = theme } label: {
                            if model.theme == theme { Label(theme.name, systemImage: "checkmark") } else { Text(theme.name) }
                        }
                    }
                } label: {
                    Image(systemName: "paintpalette")
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .help("Terminal colour theme")
                Picker("Layout", selection: $model.layout) {
                    ForEach(LayoutMode.allCases) { mode in
                        Image(systemName: mode.symbol).help(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 150)
                .padding(.trailing, 8)
            }
            Divider()
            if model.tabs.isEmpty {
                ContentUnavailableView("No session open", systemImage: "sparkle",
                                       description: Text("Pick a session on the left or start a new one."))
            } else {
                PaneLayout()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black.opacity(0.28))
            }
        }
    }
}

struct PaneLayout: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        switch model.layout {
        case .single:
            slot(0)
        case .sideBySide:
            HSplitView { slot(0); slot(1) }
        case .stacked:
            VSplitView { slot(0); slot(1) }
        case .grid:
            VSplitView {
                HSplitView { slot(0); slot(1) }
                HSplitView { slot(2); slot(3) }
            }
        }
    }

    @ViewBuilder private func slot(_ index: Int) -> some View {
        if let tab = model.tab(inPane: index) {
            PaneView(tab: tab, index: index, store: model.store).id(tab.id)
        } else {
            EmptyPane(index: index)
        }
    }
}

/// An empty pane. Click it to make it the target, or drop a session on it.
struct EmptyPane: View {
    @EnvironmentObject var model: AppModel
    let index: Int

    var body: some View {
        ContentUnavailableView("Empty pane", systemImage: "square.dashed",
                               description: Text("Pick a session on the left, or drop one here."))
            .frame(minWidth: 200, maxWidth: .infinity, minHeight: 120, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 10).fill(model.theme.backgroundColor.opacity(0.5)))
            .overlay(RoundedRectangle(cornerRadius: 10)
                .stroke(model.activePane == index && model.layout != .single ? Color.accentColor : Color.white.opacity(0.08),
                        lineWidth: model.activePane == index ? 2 : 1))
            .padding(6)
            .contentShape(Rectangle())
            .onTapGesture { model.selectPane(index) }
            .paneDrop(model, index: index)
    }
}

extension View {
    /// Accepts a session id dropped on a pane, and shows where it will land.
    func paneDrop(_ model: AppModel, index: Int) -> some View {
        dropDestination(for: String.self) { items, _ in
            model.drop(items, inPane: index)
        } isTargeted: { targeted in
            if targeted { model.dropTarget = index } else if model.dropTarget == index { model.dropTarget = nil }
        }
        .overlay {
            if model.dropTarget == index {
                ZStack {
                    RoundedRectangle(cornerRadius: 10).fill(Color.accentColor.opacity(0.14))
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 3, dash: [8, 5]))
                }
                .padding(6)
                .allowsHitTesting(false)
            }
        }
    }
}

struct PaneView: View {
    @EnvironmentObject var model: AppModel
    let tab: TerminalTab
    let index: Int
    @ObservedObject var store: SessionStore

    var body: some View {
        let state = store.sessions.first { $0.id == tab.id }?.state ?? .ready
        let selected = model.activePane == index && model.layout != .single
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                StateDot(state: state)
                Text(tab.title).lineLimit(1).font(.caption.weight(.medium))
                Spacer()
                Button { model.detach(tab) } label: { Image(systemName: "rectangle.portrait.and.arrow.right") }
                    .help("Undock into its own window")
                Button { model.close(tab) } label: { Image(systemName: "xmark") }
                    .help("Close session")
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background {
                ZStack {
                    model.theme.backgroundColor
                    model.tag(for: tab.id)?.color.opacity(0.35) ?? Color.white.opacity(0.07)
                }
            }
            .onTapGesture { model.selectPane(index) }
            .contextMenu { SessionTagMenu(id: tab.id) }
            TerminalContainer(tab: tab)
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(model.theme.backgroundColor)
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10)
            .stroke(selected ? Color.accentColor : state.color.opacity(0.28), lineWidth: selected ? 2 : 1))
        .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
        .padding(6)
        .paneDrop(model, index: index)
        .frame(minWidth: 200, maxWidth: .infinity, minHeight: 120, maxHeight: .infinity)
    }
}

/// Content of a separate window.
struct DetachedView: View {
    @EnvironmentObject var model: AppModel
    let tab: TerminalTab

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(tab.title).font(.caption).lineLimit(1)
                Spacer()
                Button("Next display") { model.moveToNextDisplay(tab) }
                Button("Dock") { model.dock(tab) }
            }
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color.gray.opacity(0.12))
            TerminalContainer(tab: tab)
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(model.theme.backgroundColor)
        }
    }
}

struct TabBar: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(model.tabs) { tab in
                    let detached = model.detachedIds.contains(tab.id)
                    HStack(spacing: 6) {
                        if detached { Image(systemName: "macwindow") }
                        if model.layout != .single, let pane = model.slots.firstIndex(of: tab.id) {
                            Text("\(pane + 1)").font(.caption2.bold())
                                .padding(.horizontal, 5)
                                .background(Capsule().fill(Color.accentColor.opacity(0.55)))
                        }
                        Text(tab.title).lineLimit(1)
                        Button { model.close(tab) } label: { Image(systemName: "xmark") }
                            .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(model.tag(for: tab.id)?.color.opacity(0.35) ?? Color.gray.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6)
                        .stroke(model.selectedTabId == tab.id ? Color.accentColor : .clear, lineWidth: 2))
                    .onTapGesture { model.activate(tab) }
                    .draggable(tab.id)
                    .contextMenu {
                        SessionTagMenu(id: tab.id)
                        if detached {
                            Button("Dock") { model.dock(tab) }
                        } else {
                            Button("Undock into its own window") { model.detach(tab) }
                        }
                        Button("Close") { model.close(tab) }
                    }
                }
            }
            .padding(6)
        }
    }
}
