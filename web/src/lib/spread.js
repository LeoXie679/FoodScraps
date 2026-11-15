// Spread pins that share the same building coords so stacked events are
// clickable. Adds mapLat/mapLng; items without coords are dropped.
export function withMapOffsets(items) {
  const groups = new Map()
  for (const item of items) {
    if (item.lat == null || item.lng == null) continue
    const key = `${Number(item.lat).toFixed(5)},${Number(item.lng).toFixed(5)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  const out = []
  for (const group of groups.values()) {
    group.forEach((item, i) => {
      const angle = (2 * Math.PI * i) / group.length
      // ~8–12m spread — enough to click separately, still looks like one building
      const r = group.length > 1 ? 0.00008 : 0
      out.push({
        ...item,
        mapLat: Number(item.lat) + r * Math.cos(angle),
        mapLng: Number(item.lng) + r * Math.sin(angle),
      })
    })
  }
  return out
}
