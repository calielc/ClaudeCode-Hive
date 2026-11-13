import SwiftUI
import AppKit

/// A colour the user puts on a session to tell sessions apart.
enum SessionTag: String, CaseIterable, Identifiable {
    case red, orange, yellow, green, teal, blue, purple, pink

    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    var color: Color {
        switch self {
        case .red: return Color(red: 0.92, green: 0.30, blue: 0.30)
        case .orange: return Color(red: 0.97, green: 0.58, blue: 0.20)
        case .yellow: return Color(red: 0.95, green: 0.80, blue: 0.25)
        case .green: return Color(red: 0.30, green: 0.75, blue: 0.40)
        case .teal: return Color(red: 0.25, green: 0.72, blue: 0.72)
        case .blue: return Color(red: 0.30, green: 0.55, blue: 0.95)
        case .purple: return Color(red: 0.62, green: 0.40, blue: 0.90)
        case .pink: return Color(red: 0.93, green: 0.43, blue: 0.70)
        }
    }
}

/// A round swatch in the real colour. It is not a template image, so menus do not paint it grey.
/// The chosen colour gets a white check mark inside the circle.
func tagSwatch(_ tag: SessionTag, selected: Bool) -> NSImage {
    let image = NSImage(size: NSSize(width: 14, height: 14), flipped: false) { rect in
        NSColor(tag.color).setFill()
        NSBezierPath(ovalIn: rect.insetBy(dx: 1, dy: 1)).fill()
        if selected {
            let check = NSBezierPath()
            check.move(to: NSPoint(x: 4, y: 7.2))
            check.line(to: NSPoint(x: 6.2, y: 4.8))
            check.line(to: NSPoint(x: 10, y: 9.4))
            check.lineWidth = 1.7
            check.lineCapStyle = .round
            check.lineJoinStyle = .round
            NSColor.white.setStroke()
            check.stroke()
        }
        return true
    }
    image.isTemplate = false
    return image
}

/// The "Colour" choices in a right-click menu.
struct SessionTagMenu: View {
    @EnvironmentObject var model: AppModel
    let ids: [String]

    init(id: String) { ids = [id] }
    init(ids: [String]) { self.ids = ids }

    var body: some View {
        // The check mark shows only when every chosen session has that colour.
        let current: SessionTag? = Set(ids.map { model.tag(for: $0)?.rawValue ?? "" }).count == 1
            ? model.tag(for: ids[0]) : nil
        Menu("Colour") {
            ForEach(SessionTag.allCases) { tag in
                Button { ids.forEach { model.setTag(tag, for: $0) } } label: {
                    Label {
                        Text(tag.title)
                    } icon: {
                        Image(nsImage: tagSwatch(tag, selected: current == tag))
                    }
                }
            }
            if ids.contains(where: { model.tag(for: $0) != nil }) {
                Divider()
                Button("No colour") { ids.forEach { model.setTag(nil, for: $0) } }
            }
        }
    }
}

extension View {
    /// A coloured stripe on the leading edge.
    func tagStripe(_ tag: SessionTag?, inset: CGFloat = 0) -> some View {
        overlay(alignment: .leading) {
            if let tag {
                Capsule().fill(tag.color).frame(width: 4).padding(.vertical, inset)
            }
        }
    }
}
