/** yyyy-mm-dd in local time, for date inputs. */
export function toDateInput(time: number): string {
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A date input's day (local time): its start, or its last millisecond. */
export function fromDateInput(value: string, endOfDay: boolean): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return endOfDay
    ? new Date(year!, month! - 1, day!, 23, 59, 59, 999).getTime()
    : new Date(year!, month! - 1, day!).getTime()
}
