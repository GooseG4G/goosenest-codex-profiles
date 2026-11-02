const MINUTES_PER_HOUR = 60
const MINUTES_PER_WEEK = 7 * 24 * MINUTES_PER_HOUR
const MINUTES_PER_MONTH = 30 * 24 * MINUTES_PER_HOUR

function normalizedDuration(durationMinutes: number | null | undefined): number | null {
  const duration = Number(durationMinutes)
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

export function formatUsageWindowName(durationMinutes: number | null | undefined): string | null {
  const duration = normalizedDuration(durationMinutes)
  if (duration === null) return null
  if (duration === MINUTES_PER_MONTH) return 'Monthly'
  if (duration % MINUTES_PER_MONTH === 0) return `${duration / MINUTES_PER_MONTH}-month`
  if (duration === MINUTES_PER_WEEK) return 'Weekly'
  if (duration % MINUTES_PER_WEEK === 0) return `${duration / MINUTES_PER_WEEK}-week`
  if (duration % MINUTES_PER_HOUR === 0) return `${duration / MINUTES_PER_HOUR} hr`
  return `${duration} min`
}

export function formatUsageLimitLabel(
  durationMinutes: number | null | undefined,
  fallback: string,
): string {
  const name = formatUsageWindowName(durationMinutes)
  if (!name) return fallback
  if (name.endsWith(' hr')) return `${name.slice(0, -3)}-hour limit`
  if (name.endsWith(' min')) return `${name.slice(0, -4)}-minute limit`
  return `${name} limit`
}

export function formatUsageResetScope(
  durations: readonly (number | null | undefined)[] = [],
): string {
  const uniqueDurations = [...new Set(
    durations
      .map(normalizedDuration)
      .filter((duration): duration is number => duration !== null),
  )]

  return uniqueDurations
    .sort((left, right) => right - left)
    .map(formatUsageWindowName)
    .filter((label): label is string => Boolean(label))
    .join(' + ')
}
