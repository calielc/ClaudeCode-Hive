import AppKit

/// The app icon, drawn in code so there is one source for the Dock and for the .icns file.
func makeAppIcon(size: CGFloat) -> NSImage {
    NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
        let margin = rect.width * 0.09
        let body = rect.insetBy(dx: margin, dy: margin)
        let shape = NSBezierPath(roundedRect: body, xRadius: body.width * 0.225, yRadius: body.width * 0.225)

        NSGraphicsContext.saveGraphicsState()
        shape.addClip()
        NSGradient(colors: [
            NSColor(red: 1.00, green: 0.72, blue: 0.20, alpha: 1),
            NSColor(red: 0.95, green: 0.38, blue: 0.12, alpha: 1),
        ])?.draw(in: body, angle: -60)
        NSGraphicsContext.restoreGraphicsState()

        // Three cells of a honeycomb: one solid, two outlined.
        let radius = body.width * 0.19
        let step = radius * 1.78
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let cells: [(CGPoint, Bool)] = [
            (CGPoint(x: center.x, y: center.y + step * 0.58), true),
            (CGPoint(x: center.x - step * 0.5, y: center.y - step * 0.29), false),
            (CGPoint(x: center.x + step * 0.5, y: center.y - step * 0.29), false),
        ]
        for (point, solid) in cells {
            let hexagon = NSBezierPath()
            for corner in 0..<6 {
                let angle = CGFloat.pi / 3 * CGFloat(corner) + CGFloat.pi / 6
                let vertex = CGPoint(x: point.x + radius * cos(angle), y: point.y + radius * sin(angle))
                corner == 0 ? hexagon.move(to: vertex) : hexagon.line(to: vertex)
            }
            hexagon.close()
            hexagon.lineJoinStyle = .round
            NSColor.white.withAlphaComponent(0.96).setFill()
            NSColor.white.withAlphaComponent(0.96).setStroke()
            if solid {
                hexagon.fill()
            } else {
                hexagon.lineWidth = radius * 0.17
                hexagon.stroke()
            }
        }
        return true
    }
}

/// Writes the PNG files of an .iconset folder. `iconutil` turns them into AppIcon.icns.
func exportIconSet(to directory: String) {
    try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
    for base in [16, 32, 128, 256, 512] {
        for scale in [1, 2] {
            let pixels = base * scale
            guard let bitmap = NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
                samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                bytesPerRow: 0, bitsPerPixel: 0
            ) else { continue }
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
            makeAppIcon(size: CGFloat(pixels)).draw(in: NSRect(x: 0, y: 0, width: pixels, height: pixels))
            NSGraphicsContext.restoreGraphicsState()
            let name = scale == 1 ? "icon_\(base)x\(base).png" : "icon_\(base)x\(base)@2x.png"
            try? bitmap.representation(using: .png, properties: [:])?
                .write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
        }
    }
}
