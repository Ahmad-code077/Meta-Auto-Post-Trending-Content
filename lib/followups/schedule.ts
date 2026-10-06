// When follow-ups may be sent: Tuesday to Thursday, 9:00 to 11:00 AM, in one configured timezone.
// Mondays and Fridays are skipped because inboxes are busiest on Monday and winding down on Friday.
// Pure functions over Intl, so there is no date library to add.

export const DEFAULT_FOLLOW_UP_TIMEZONE = 'Asia/Karachi';
export const SEND_DAYS = [2, 3, 4] as const; // Tuesday, Wednesday, Thursday (0 = Sunday)
export const SEND_HOUR_START = 9;
export const SEND_HOUR_END = 11;

export function followUpTimeZone(env: Record<string, string | undefined> = process.env): string {
    return env.FOLLOW_UP_TIMEZONE || DEFAULT_FOLLOW_UP_TIMEZONE;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weekday: number;
}

// The calendar date and clock time a moment shows in the given timezone.
export function zonedParts(date: Date, zone: string): ZonedParts {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour) % 24,
        minute: Number(parts.minute),
        weekday: WEEKDAYS[parts.weekday],
    };
}

// The instant at which the timezone shows the given local date and time.
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, zone: string): Date {
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    let guess = new Date(wanted);
    // Two passes correct for the offset, including across daylight-saving changes.
    for (let i = 0; i < 2; i++) {
        const shown = zonedParts(guess, zone);
        const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
        guess = new Date(guess.getTime() + (wanted - shownAsUtc));
    }
    return guess;
}

export function isSendWindow(date: Date, zone: string): boolean {
    const p = zonedParts(date, zone);
    return (SEND_DAYS as readonly number[]).includes(p.weekday) && p.hour >= SEND_HOUR_START && p.hour < SEND_HOUR_END;
}

// The first moment at or after `base` that is inside the send window. A moment already inside it is returned unchanged.
// Automatic follow-ups are placed at the start of the window (9:00 AM), so the daily cron can pick them up on time.
export function nextSendSlot(base: Date, zone: string): Date {
    if (isSendWindow(base, zone)) return base;

    const start = zonedParts(base, zone);
    for (let offset = 0; offset <= 14; offset++) {
        const calendarDay = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
        if (!(SEND_DAYS as readonly number[]).includes(calendarDay.getUTCDay())) continue;

        const slot = zonedTimeToUtc(
            calendarDay.getUTCFullYear(),
            calendarDay.getUTCMonth() + 1,
            calendarDay.getUTCDate(),
            SEND_HOUR_START,
            0,
            zone
        );
        if (slot.getTime() >= base.getTime()) return slot;
    }
    throw new Error('No send window within two weeks');
}

export function sendWindowLabel(zone: string): string {
    return `Tuesday to Thursday, ${SEND_HOUR_START}:00 to ${SEND_HOUR_END}:00 AM (${zone})`;
}

// Spreads sends across the rest of the window, so two follow-ups due at the same time do not go out in the same minute.
// Every result stays inside the window: it is before 11:00 by at least a minute.
export function jitteredSendSlot(base: Date, zone: string, random: () => number = Math.random): Date {
    const start = nextSendSlot(base, zone);
    const day = zonedParts(start, zone);
    const windowEnd = zonedTimeToUtc(day.year, day.month, day.day, SEND_HOUR_END, 0, zone);
    const spanMinutes = Math.floor((windowEnd.getTime() - start.getTime() - 60_000) / 60_000);
    if (spanMinutes <= 0) return start;
    const offset = Math.min(spanMinutes - 1, Math.floor(random() * spanMinutes));
    return new Date(start.getTime() + offset * 60_000);
}

// Most follow-ups a single scheduler run sends. The rest move to a later slot, so one run never sends a burst.
export const MAX_SENDS_PER_RUN = 8;
// Pause between two sends in the same run, in milliseconds. Random, so the gaps are not regular.
export const PACE_MIN_MS = 5_000;
export const PACE_MAX_MS = 20_000;

export function pacingMs(random: () => number = Math.random): number {
    return PACE_MIN_MS + Math.floor(random() * (PACE_MAX_MS - PACE_MIN_MS));
}
