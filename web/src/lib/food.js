// Emoji for a food description. Order matters: specific dishes first, then
// drinks/desserts, then generic snacks, so "pizza and cookies" → 🍕 and
// "granola bars and coffee" → ☕. Matching is case-insensitive; word
// boundaries keep "Price Center" from matching "rice" and "team" from "tea".
const EMOJI_RULES = [
  [/pizza/, '🍕'],
  [/taco/, '🌮'],
  [/burrito/, '🌯'],
  [/sushi/, '🍣'],
  [/\brice\b|biryani|curry/, '🍛'],
  [/\bbbq\b|barbecue|burger|hot ?dogs?/, '🍔'],
  [/sandwich|\bsubs?\b/, '🥪'],
  [/bagel|breakfast/, '🥯'],
  [/ice[- ]?cream/, '🍦'],
  [/donut|doughnut/, '🍩'],
  [/boba|bubble tea|milk tea/, '🧋'],
  [/coffee/, '☕'],
  [/cookie|dessert|sweets?\b|cake|pastr/, '🍪'],
  [/fruit/, '🍎'],
  [/snack|refreshment|\bchips\b|granola/, '🍿'],
  [/\bdrinks?\b|\btea\b/, '🧋'],
]

export const DEFAULT_FOOD_EMOJI = '🍽️'

function match(text) {
  const t = (text || '').toLowerCase()
  if (!t) return null
  for (const [pattern, emoji] of EMOJI_RULES) {
    if (pattern.test(t)) return emoji
  }
  return null
}

/**
 * Pick an emoji from the food description, falling back to the title
 * ("Lo-fi Study Break with Free Snacks"), then 🍽️.
 */
export function foodEmoji(foodDesc, title) {
  return match(foodDesc) ?? match(title) ?? DEFAULT_FOOD_EMOJI
}
