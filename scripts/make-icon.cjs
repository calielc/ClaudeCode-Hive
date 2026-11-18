// Draws the Hive icon (three honeycomb cells on an orange square) and saves it as build/icon.png.
// Run with: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

function hexagon(cx, cy, r) {
  const points = []
  for (let k = 0; k < 6; k += 1) {
    const angle = (Math.PI / 3) * k + Math.PI / 6
    points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`)
  }
  return points.join(' ')
}

const r = 160
const step = r * 1.78
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb833"/><stop offset="1" stop-color="#f26120"/></linearGradient></defs>
  <rect x="92" y="92" width="840" height="840" rx="190" fill="url(#g)"/>
  <polygon points="${hexagon(512, 512 - step * 0.58, r)}" fill="#fffaf5" stroke="#fffaf5" stroke-width="4" stroke-linejoin="round"/>
  <polygon points="${hexagon(512 - step / 2, 512 + step * 0.29, r)}" fill="none" stroke="#fffaf5" stroke-width="27" stroke-linejoin="round"/>
  <polygon points="${hexagon(512 + step / 2, 512 + step * 0.29, r)}" fill="none" stroke="#fffaf5" stroke-width="27" stroke-linejoin="round"/>
</svg>`

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1024, height: 1024, show: false })
  await window.loadURL('data:text/html,<html></html>')
  // A canvas keeps the transparent corners, which a window screenshot does not.
  const dataUrl = await window.webContents.executeJavaScript(`new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 1024
      canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024)
      resolve(canvas.toDataURL('image/png'))
    }
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)})
  })`)
  writeFileSync(join(__dirname, '..', 'build', 'icon.png'), Buffer.from(dataUrl.split(',')[1], 'base64'))
  app.quit()
})
