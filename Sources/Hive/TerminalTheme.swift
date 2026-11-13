import SwiftUI
import AppKit
import SwiftTerm

/// A colour scheme for the terminal: background, text and the 16 ANSI colours.
struct TerminalTheme: Identifiable, Hashable {
    let name: String
    let background: UInt32
    let foreground: UInt32
    /// 8 normal colours, then 8 bright ones: black, red, green, yellow, blue, magenta, cyan, white.
    let ansi: [UInt32]

    var id: String { name }

    static func nsColor(_ hex: UInt32) -> NSColor {
        NSColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
                blue: CGFloat(hex & 255) / 255, alpha: 1)
    }

    var backgroundColor: SwiftUI.Color { SwiftUI.Color(nsColor: Self.nsColor(background)) }
    var foregroundColor: SwiftUI.Color { SwiftUI.Color(nsColor: Self.nsColor(foreground)) }

    var terminalPalette: [SwiftTerm.Color] {
        ansi.map { SwiftTerm.Color(red8: UInt16(($0 >> 16) & 255), green8: UInt16(($0 >> 8) & 255), blue8: UInt16($0 & 255)) }
    }

    static func named(_ name: String?) -> TerminalTheme {
        all.first { $0.name == name } ?? all[0]
    }

    static let all: [TerminalTheme] = [
        TerminalTheme(name: "Tokyo Night", background: 0x1a1b26, foreground: 0xc0caf5, ansi: [
            0x15161e, 0xf7768e, 0x9ece6a, 0xe0af68, 0x7aa2f7, 0xbb9af7, 0x7dcfff, 0xa9b1d6,
            0x414868, 0xf7768e, 0x9ece6a, 0xe0af68, 0x7aa2f7, 0xbb9af7, 0x7dcfff, 0xc0caf5]),
        TerminalTheme(name: "Dracula", background: 0x282a36, foreground: 0xf8f8f2, ansi: [
            0x21222c, 0xff5555, 0x50fa7b, 0xf1fa8c, 0xbd93f9, 0xff79c6, 0x8be9fd, 0xf8f8f2,
            0x6272a4, 0xff6e6e, 0x69ff94, 0xffffa5, 0xd6acff, 0xff92df, 0xa4ffff, 0xffffff]),
        TerminalTheme(name: "Nord", background: 0x2e3440, foreground: 0xd8dee9, ansi: [
            0x3b4252, 0xbf616a, 0xa3be8c, 0xebcb8b, 0x81a1c1, 0xb48ead, 0x88c0d0, 0xe5e9f0,
            0x4c566a, 0xbf616a, 0xa3be8c, 0xebcb8b, 0x81a1c1, 0xb48ead, 0x8fbcbb, 0xeceff4]),
        TerminalTheme(name: "Gruvbox Dark", background: 0x282828, foreground: 0xebdbb2, ansi: [
            0x282828, 0xcc241d, 0x98971a, 0xd79921, 0x458588, 0xb16286, 0x689d6a, 0xa89984,
            0x928374, 0xfb4934, 0xb8bb26, 0xfabd2f, 0x83a598, 0xd3869b, 0x8ec07c, 0xebdbb2]),
        TerminalTheme(name: "Solarized Dark", background: 0x002b36, foreground: 0x93a1a1, ansi: [
            0x073642, 0xdc322f, 0x859900, 0xb58900, 0x268bd2, 0xd33682, 0x2aa198, 0xeee8d5,
            0x586e75, 0xcb4b16, 0x859900, 0xb58900, 0x268bd2, 0x6c71c4, 0x2aa198, 0xfdf6e3]),
        TerminalTheme(name: "Paper (light)", background: 0xfbf7ef, foreground: 0x3b3b3b, ansi: [
            0x3b3b3b, 0xc0392b, 0x2e8b57, 0xb7791f, 0x2b6cb0, 0x8e44ad, 0x1a8a8a, 0xd9d3c7,
            0x7f7f7f, 0xe74c3c, 0x3cb371, 0xd69e2e, 0x3182ce, 0x9b59b6, 0x20a4a4, 0xffffff]),
    ]
}
