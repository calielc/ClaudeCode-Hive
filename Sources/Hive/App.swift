import SwiftUI

@main
struct HiveApp: App {
    @StateObject private var model = AppModel()

    init() {
        // `Hive --export-icon <folder>` writes the icon files and quits. bundle.sh uses it.
        let arguments = CommandLine.arguments
        if let flag = arguments.firstIndex(of: "--export-icon"), flag + 1 < arguments.count {
            exportIconSet(to: arguments[flag + 1])
            exit(0)
        }
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.applicationIconImage = makeAppIcon(size: 512)
    }

    var body: some Scene {
        WindowGroup("Hive") {
            ContentView()
                .environmentObject(model)
                .onAppear { NSApplication.shared.activate(ignoringOtherApps: true) }
        }
        .defaultSize(width: 1400, height: 860)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About Hive") {
                    NSApplication.shared.orderFrontStandardAboutPanel(options: [
                        .applicationName: "Hive",
                        .credits: NSAttributedString(string: "Your Claude Code sessions, in one place."),
                    ])
                }
            }
            CommandGroup(after: .newItem) {
                Button("New Session") { model.newSession() }.keyboardShortcut("n")
                Button("Add Folder…") { model.addFolder() }.keyboardShortcut("o")
            }
            CommandMenu("Layout") {
                ForEach(Array(LayoutMode.allCases.enumerated()), id: \.element) { index, mode in
                    Button(mode.title) { model.layout = mode }
                        .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: [.command, .option])
                }
                Divider()
                Button("Undock selected session") {
                    if let tab = model.selectedTab { model.detach(tab) }
                }.keyboardShortcut("d", modifiers: [.command, .shift])
            }
        }
    }
}
