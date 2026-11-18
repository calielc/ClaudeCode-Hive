/**
 * Case-insensitive search for a text in a buffer, for ASCII letters. Other characters must match exactly.
 * It looks for the rarest letter of the text with the fast `Buffer.indexOf`, in both cases,
 * and only checks the full text around those hits. That is much faster than lowercasing the whole buffer.
 */
const RARE_FIRST = 'zqxjkvbpygfwmucldrhsnioate'

function rarity(character: string): number {
  const index = RARE_FIRST.indexOf(character.toLowerCase())
  return index === -1 ? -1 : index
}

export interface FoldNeedle {
  lower: Buffer
  anchorOffset: number
  anchorLower: number
  anchorUpper: number
}

export function prepareNeedle(text: string): FoldNeedle {
  const lower = Buffer.from(text.toLowerCase(), 'utf8')
  // Pick the anchor byte: a digit, a symbol or the rarest letter. Bytes of multi-byte characters are rare too.
  let anchorOffset = 0
  let best = Number.POSITIVE_INFINITY
  for (let offset = 0; offset < lower.length; offset += 1) {
    const character = String.fromCharCode(lower[offset])
    const score = lower[offset] >= 0x80 || !/[a-z]/.test(character) ? -1 : rarity(character)
    if (score < best) {
      best = score
      anchorOffset = offset
    }
  }
  const byte = lower[anchorOffset]
  const upper = byte >= 0x61 && byte <= 0x7a ? byte - 32 : byte
  return { lower, anchorOffset, anchorLower: byte, anchorUpper: upper }
}

function matchesAt(buffer: Buffer, start: number, lower: Buffer): boolean {
  if (start < 0 || start + lower.length > buffer.length) {
    return false
  }
  for (let offset = 0; offset < lower.length; offset += 1) {
    let byte = buffer[start + offset]
    if (byte >= 0x41 && byte <= 0x5a) {
      byte += 32
    }
    if (byte !== lower[offset]) {
      return false
    }
  }
  return true
}

export function containsFolded(buffer: Buffer, needle: FoldNeedle): boolean {
  if (needle.lower.length === 0) {
    return false
  }
  let nextLower = buffer.indexOf(needle.anchorLower, 0)
  let nextUpper = needle.anchorUpper === needle.anchorLower ? -1 : buffer.indexOf(needle.anchorUpper, 0)
  while (nextLower !== -1 || nextUpper !== -1) {
    const useLower = nextUpper === -1 || (nextLower !== -1 && nextLower < nextUpper)
    const position = useLower ? nextLower : nextUpper
    if (matchesAt(buffer, position - needle.anchorOffset, needle.lower)) {
      return true
    }
    if (useLower) {
      nextLower = buffer.indexOf(needle.anchorLower, position + 1)
    } else {
      nextUpper = buffer.indexOf(needle.anchorUpper, position + 1)
    }
  }
  return false
}
