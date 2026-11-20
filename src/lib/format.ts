// The interface is in English, so numbers are written the English way everywhere
// ("1,234"). Dates follow the browser's locale.
const numberFormat = new Intl.NumberFormat('en')

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

export function formatCount(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${numberFormat.format(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value < 10 ? 1 : 0
  return `${value.toFixed(digits)} ${units[unit] ?? 'TB'}`
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Orders names as people expect: ignoring case and accents, "Lesson 2" before "Lesson 10". */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b)
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** A date (ms since epoch) in the browser's locale, e.g. "3 Feb 2024". */
export function formatDate(ms: number): string {
  return dateFormat.format(ms)
}
