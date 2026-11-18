import SwiftUI
import SwiftTerm

/// One open tab. The terminal view lives here, so it keeps running when you switch tabs.
@MainActor
final class TerminalTab: ObservableObject, Identifiable {
    let id: String
    let folder: String
    @Published var title: String
    let view: LocalProcessTerminalView
    /// Called when the Claude process ends by itself, for example after /exit.
    var onExit: (() -> Void)?
    private(set) var isClosing = false
    private let startedAt = Date()
    private var processDelegate: TabProcessDelegate?

    init(sessionId: String, title: String, folder: String, resume: Bool, theme: TerminalTheme) {
        self.id = sessionId
        self.title = title
        self.folder = folder
        view = LocalProcessTerminalView(frame: .zero)
        view.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        apply(theme)
        let delegate = TabProcessDelegate(tab: self)
        processDelegate = delegate
        view.processDelegate = delegate   // weak in SwiftTerm, so the tab keeps it alive

        // `claude` can be a shell function in the user's zsh setup, so start a login shell.
        let command = resume ? "claude --resume \(sessionId)" : "claude --session-id \(sessionId)"
        var environment = Terminal.getEnvironmentVariables(termName: "xterm-256color")
        environment.append("CLAUDE_SESSIONS_APP=1")
        view.startProcess(
            executable: "/bin/zsh",
            args: ["-l", "-i", "-c", command],
            environment: environment,
            currentDirectory: folder
        )
    }

    func apply(_ theme: TerminalTheme) {
        view.installColors(theme.terminalPalette)
        view.nativeBackgroundColor = TerminalTheme.nsColor(theme.background)
        view.nativeForegroundColor = TerminalTheme.nsColor(theme.foreground)
        view.caretColor = TerminalTheme.nsColor(theme.foreground)
        view.selectedTextBackgroundColor = TerminalTheme.nsColor(theme.foreground).withAlphaComponent(0.25)
        view.needsDisplay = true
    }

    func close() {
        isClosing = true
        view.terminate()
    }

    /// Called on the main thread when the process ended.
    fileprivate func processEnded(exitCode: Int32?) {
        guard !isClosing else { return }
        // A process that fails right away (for example "command not found") keeps its tab,
        // so the error message stays readable.
        if exitCode != 0 && Date().timeIntervalSince(startedAt) < 3 { return }
        onExit?()
    }
}

private final class TabProcessDelegate: NSObject, LocalProcessTerminalViewDelegate {
    private weak var tab: TerminalTab?
    init(tab: TerminalTab) { self.tab = tab }

    func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {}
    func setTerminalTitle(source: LocalProcessTerminalView, title: String) {}
    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}

    func processTerminated(source: TerminalView, exitCode: Int32?) {
        DispatchQueue.main.async { [weak self] in self?.tab?.processEnded(exitCode: exitCode) }
    }
}

/// A pane's terminal. The pane keeps its own view, and only the terminal inside changes when the
/// session in the pane changes. That keeps the split sizes stable.
struct TerminalContainer: NSViewRepresentable {
    let tab: TerminalTab

    func makeNSView(context: Context) -> NSView {
        let container = NSView()
        attach(tab.view, to: container)
        return container
    }

    func updateNSView(_ container: NSView, context: Context) {
        guard container.subviews.first !== tab.view else { return }
        container.subviews.forEach { $0.removeFromSuperview() }
        attach(tab.view, to: container)
    }

    private func attach(_ terminal: NSView, to container: NSView) {
        terminal.removeFromSuperview()   // it may still sit in another pane for a moment
        terminal.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(terminal)
        NSLayoutConstraint.activate([
            terminal.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            terminal.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            terminal.topAnchor.constraint(equalTo: container.topAnchor),
            terminal.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
    }
}
