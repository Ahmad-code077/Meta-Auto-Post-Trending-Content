import { format } from 'date-fns'

// "2021-03-01" -> "Mar 2021". Empty end date means the entry is current.
export function dateRangeLabel(start: string | null, end: string | null): string {
    const from = start ? format(new Date(`${start}T00:00:00`), 'MMM yyyy') : null
    const to = end ? format(new Date(`${end}T00:00:00`), 'MMM yyyy') : 'Present'
    if (!from) return to === 'Present' ? 'Dates not set' : to
    return `${from} – ${to}`
}

// Month inputs use YYYY-MM.
export function toMonth(date: string | null): string {
    return date ? date.slice(0, 7) : ''
}

// One item per line in a textarea. Blank lines are dropped.
export function linesToList(value: string): string[] {
    return value.split('\n').map((line) => line.trim()).filter(Boolean)
}

export function listToLines(items: string[]): string {
    return items.join('\n')
}
