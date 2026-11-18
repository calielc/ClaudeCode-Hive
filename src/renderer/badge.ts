/** A round red badge with the number, as a PNG data URL. The taskbar shows it on the Hive icon. */
export function drawBadge(count: number): string {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    return ''
  }
  context.fillStyle = '#eb4d4d'
  context.beginPath()
  context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = 'bold 40px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(count > 9 ? '9+' : String(count), size / 2, size / 2 + 3)
  return canvas.toDataURL('image/png')
}
