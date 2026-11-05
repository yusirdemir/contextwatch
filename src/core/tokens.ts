// A quick token estimate for text being typed. Claude Code exposes no
// tokenizer to a mod, so this counts characters: plain ASCII runs about four
// characters a token, other scripts (Turkish letters, accents, emoji) far
// fewer. It errs high rather than low, since the figure it feeds is a floor.

const ASCII_PER_TOKEN = 3.5
const OTHER_PER_TOKEN = 1.5

export const estimateTokens = (text: string): number => {
  if (text.trim() === '') return 0

  let ascii = 0
  let other = 0
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++
    else other++
  }

  return Math.ceil(ascii / ASCII_PER_TOKEN + other / OTHER_PER_TOKEN)
}

// Redraws are tied to this: the band moves in steps, not on every key.
export const DRAFT_STEP = 20

export const bucketTokens = (tokens: number): number => (tokens === 0 ? 0 : Math.ceil(tokens / DRAFT_STEP) * DRAFT_STEP)
