export function formatRemainingTime(value: number, now = Date.now()): string {
  if (!Number.isFinite(value)) return ''
  const minutes = Math.ceil((value - now) / 60_000)
  if (minutes <= 0) return ''
  const days = Math.floor(minutes / 1_440)
  const hours = Math.floor((minutes % 1_440) / 60)
  const remainingMinutes = minutes % 60
  if (days) return `${days}d${hours ? ` ${hours}h` : ''}`
  if (hours) return `${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ''}`
  return `${remainingMinutes}m`
}
