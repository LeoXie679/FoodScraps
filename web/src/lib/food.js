// First matching keyword wins, so put more specific foods first.
const EMOJI_RULES = [
  [/pizza/, '🍕'],
  [/boba|bubble tea|milk tea/, '🧋'],
  [/taco/, '🌮'],
  [/burrito/, '🌯'],
  [/donut|doughnut/, '🍩'],
  [/coffee/, '☕'],
  [/cookie/, '🍪'],
  [/sushi/, '🍣'],
  [/biryani|curry/, '🍛'],
  [/sandwich/, '🥪'],
]

export const DEFAULT_FOOD_EMOJI = '🍽️'

export function foodEmoji(text) {
  const t = (text || '').toLowerCase()
  for (const [pattern, emoji] of EMOJI_RULES) {
    if (pattern.test(t)) return emoji
  }
  return DEFAULT_FOOD_EMOJI
}
