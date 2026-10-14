const absoluteDateTime = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatDateTime(value: string | number | Date): string {
  const parts = Object.fromEntries(
    absoluteDateTime
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month} ${parts.day}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}
