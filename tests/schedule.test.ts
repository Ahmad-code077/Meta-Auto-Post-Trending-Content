// Send window for follow-ups: Tuesday to Thursday, 9:00 to 11:00 AM in the configured timezone.
// Pure Intl calculations. No network, no model, no database.

import test from 'node:test'
import assert from 'node:assert/strict'
import { followUpTimeZone, isSendWindow, jitteredSendSlot, MAX_SENDS_PER_RUN, nextSendSlot, pacingMs, PACE_MAX_MS, PACE_MIN_MS, zonedParts, zonedTimeToUtc, DEFAULT_FOLLOW_UP_TIMEZONE } from '../lib/followups/schedule'
import { followUpDueAt } from '../lib/followups/policy'
import { parseDueAt } from '../lib/followups/manage'

const KARACHI = 'Asia/Karachi' // UTC+5, no daylight saving
const NEW_YORK = 'America/New_York' // observes daylight saving

// Karachi local time helpers, written as the local clock time so the tests read naturally.
const local = (iso: string, zone = KARACHI) => {
    const [date, time] = iso.split('T')
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = time.split(':').map(Number)
    return zonedTimeToUtc(y, m, d, h, min, zone)
}
const show = (date: Date, zone = KARACHI) => {
    const p = zonedParts(date, zone)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)} weekday=${p.weekday}`
}

test('the default timezone is Karachi, and it can be overridden by configuration', () => {
    assert.equal(DEFAULT_FOLLOW_UP_TIMEZONE, 'Asia/Karachi')
    assert.equal(followUpTimeZone({}), 'Asia/Karachi')
    assert.equal(followUpTimeZone({ FOLLOW_UP_TIMEZONE: 'Europe/London' }), 'Europe/London')
})

test('the window is Tuesday, Wednesday and Thursday, from 9:00 up to 11:00 local', () => {
    // 2026-10-13 is a Tuesday.
    assert.equal(isSendWindow(local('2026-10-13T09:00'), KARACHI), true)
    assert.equal(isSendWindow(local('2026-10-14T10:59'), KARACHI), true)
    assert.equal(isSendWindow(local('2026-10-15T09:30'), KARACHI), true)
    assert.equal(isSendWindow(local('2026-10-13T08:59'), KARACHI), false, 'before 9:00')
    assert.equal(isSendWindow(local('2026-10-13T11:00'), KARACHI), false, 'at 11:00 is outside')
    assert.equal(isSendWindow(local('2026-10-13T14:00'), KARACHI), false, 'afternoon')
})

test('Monday, Friday, Saturday and Sunday are never inside the window, even at 9:30 AM', () => {
    const days = ['2026-10-12', '2026-10-16', '2026-10-17', '2026-10-18'] // Mon, Fri, Sat, Sun
    for (const day of days) {
        assert.equal(isSendWindow(local(`${day}T09:30`), KARACHI), false, day)
    }
})

test('a follow-up due on a Friday moves to the Tuesday morning window', () => {
    const next = nextSendSlot(local('2026-10-16T10:00'), KARACHI) // Friday 10:00
    assert.equal(show(next), '2026-10-20 09:00 weekday=2')
})

test('a follow-up due on a Monday moves to the Tuesday morning window', () => {
    const next = nextSendSlot(local('2026-10-12T15:00'), KARACHI) // Monday afternoon
    assert.equal(show(next), '2026-10-13 09:00 weekday=2')
})

test('a follow-up due on a Thursday afternoon moves to the next Tuesday morning', () => {
    const next = nextSendSlot(local('2026-10-15T13:00'), KARACHI) // Thursday afternoon
    assert.equal(show(next), '2026-10-20 09:00 weekday=2')
})

test('a moment already inside the window is kept exactly as it is', () => {
    const inside = local('2026-10-14T10:15')
    assert.equal(nextSendSlot(inside, KARACHI).getTime(), inside.getTime())
})

test('a moment before 9:00 on a valid day moves to 9:00 that same morning', () => {
    const next = nextSendSlot(local('2026-10-13T07:00'), KARACHI)
    assert.equal(show(next), '2026-10-13 09:00 weekday=2')
})

test('automatic follow-ups are placed 7 days out, then moved to the window', () => {
    // Sent Tuesday 2026-10-06 at 10:00 Karachi. Plus 7 days is Tuesday 2026-10-13 at 10:00, already inside the window.
    const sentAt = local('2026-10-06T10:00')
    const due = followUpDueAt(sentAt, KARACHI, () => 0)
    assert.equal(show(due), '2026-10-13 10:00 weekday=2')
    assert.equal(isSendWindow(due, KARACHI), true)
})

test('automatic follow-ups sent on a Thursday land on a valid day, never on a Friday', () => {
    // Sent Thursday 2026-10-08 at 17:00. Plus 7 days is Thursday 2026-10-15 at 17:00: after the window, so Tuesday 9:00.
    const due = followUpDueAt(local('2026-10-08T17:00'), KARACHI, () => 0)
    assert.equal(show(due), '2026-10-20 09:00 weekday=2')
})

test('every automatic follow-up is inside the window, whatever day it was sent', () => {
    for (let day = 0; day < 14; day++) {
        const sent = new Date(local('2026-10-01T10:00').getTime() + day * 86_400_000 + 3 * 3_600_000)
        const due = followUpDueAt(sent, KARACHI, () => 0.5)
        assert.equal(isSendWindow(due, KARACHI), true, `sent ${show(sent)} -> ${show(due)}`)
        assert.ok(due.getTime() >= sent.getTime() + 7 * 86_400_000, 'never earlier than 7 days out')
    }
})

test('the window follows daylight-saving time in a zone that uses it', () => {
    // 9:00 New York is 13:00 UTC in winter (EST, UTC-5) and 13:00 UTC in summer too after the clocks change below.
    const winter = zonedTimeToUtc(2026, 1, 13, 9, 0, NEW_YORK) // 2026-01-13, a Tuesday, EST
    const summer = zonedTimeToUtc(2026, 7, 14, 9, 0, NEW_YORK) // 2026-07-14, a Tuesday, EDT
    assert.equal(winter.toISOString(), '2026-01-13T14:00:00.000Z')
    assert.equal(summer.toISOString(), '2026-07-14T13:00:00.000Z')
    assert.equal(isSendWindow(winter, NEW_YORK), true)
    assert.equal(isSendWindow(summer, NEW_YORK), true)
})

test('a manual reschedule outside the window is refused with the rule in the message', () => {
    const now = local('2026-10-06T10:00')
    const friday = parseDueAt(local('2026-10-16T10:00').toISOString(), now, KARACHI)
    assert.equal(friday.ok, false)
    assert.match(friday.ok === false ? friday.message : '', /Tuesday to Thursday, 9:00 to 11:00 AM/)
})

test('a manual reschedule inside the window is accepted', () => {
    const now = local('2026-10-06T10:00')
    const tuesday = parseDueAt(local('2026-10-13T10:00').toISOString(), now, KARACHI)
    assert.equal(tuesday.ok, true)
})

// A seeded generator, so the spread checks below are repeatable.
function seeded(seed: number): () => number {
    let x = seed
    return () => {
        x = (x * 1103515245 + 12345) & 0x7fffffff
        return x / 0x80000000
    }
}

test('jitter: different random values give different send times inside the same window', () => {
    const base = local('2026-10-13T09:00')
    const times = new Set([0, 0.2, 0.5, 0.8, 0.99].map((r) => jitteredSendSlot(base, KARACHI, () => r).getTime()))
    assert.equal(times.size, 5)
})

test('jitter: starts at the beginning of the window when the base is before it, and never before', () => {
    const before = local('2026-10-13T07:00')
    assert.equal(show(jitteredSendSlot(before, KARACHI, () => 0)), '2026-10-13 09:00 weekday=2')
    assert.ok(jitteredSendSlot(before, KARACHI, () => 0.7).getTime() >= local('2026-10-13T09:00').getTime())
})

test('jitter: every result is inside the window, for many bases and random values', () => {
    const random = seeded(42)
    for (let i = 0; i < 300; i++) {
        const base = new Date(local('2026-10-01T00:00').getTime() + Math.floor(random() * 21 * 86_400_000))
        const slot = jitteredSendSlot(base, KARACHI, random)
        assert.equal(isSendWindow(slot, KARACHI), true, `base ${show(base)} -> ${show(slot)}`)
        assert.ok(slot.getTime() >= base.getTime() || !isSendWindow(base, KARACHI), 'never earlier than a base that is already in the window')
    }
})

test('jitter: a result is never at or after 11:00 local, even at the very top of the random range', () => {
    const slot = jitteredSendSlot(local('2026-10-14T09:00'), KARACHI, () => 0.999999)
    assert.equal(isSendWindow(slot, KARACHI), true)
    assert.ok(zonedParts(slot, KARACHI).hour === 10, show(slot))
})

test('jitter: a base late in the window stays inside it', () => {
    const slot = jitteredSendSlot(local('2026-10-14T10:58'), KARACHI, () => 0.9)
    assert.equal(isSendWindow(slot, KARACHI), true)
})

test('jitter: a base on a weekend moves to a Tuesday-to-Thursday window, still jittered', () => {
    const slot = jitteredSendSlot(local('2026-10-17T12:00'), KARACHI, () => 0.5)
    assert.equal(isSendWindow(slot, KARACHI), true)
    assert.equal(zonedParts(slot, KARACHI).weekday, 2)
})

test('jitter: follow-up due times differ across many sent emails and stay in the window', () => {
    const random = seeded(7)
    const sentTimes = new Set<number>()
    for (let i = 0; i < 40; i++) {
        const sent = local('2026-10-01T10:00')
        sentTimes.add(followUpDueAt(sent, KARACHI, random).getTime())
    }
    assert.ok(sentTimes.size > 20, 'due times should be spread, not all identical')
    for (const t of sentTimes) assert.equal(isSendWindow(new Date(t), KARACHI), true)
})

test('pacing: each pause is inside the configured range', () => {
    const random = seeded(3)
    for (let i = 0; i < 200; i++) {
        const ms = pacingMs(random)
        assert.ok(ms >= PACE_MIN_MS && ms < PACE_MAX_MS, String(ms))
    }
    assert.equal(pacingMs(() => 0), PACE_MIN_MS)
})

test('the per-run send cap is a small number', () => {
    assert.equal(MAX_SENDS_PER_RUN, 8)
})
