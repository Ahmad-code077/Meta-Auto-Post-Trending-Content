// Structured, one-line JSON logs. Fields are limited to primitives, and keys that can carry
// secrets or message content are dropped before anything is written.

export type LogLevel = 'info' | 'warn' | 'error';
export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

// Matched against the key name. Keys ending in "_id" are always kept, so "email_id" is allowed.
const DENIED_KEY = /pass|secret|token|key|auth|cookie|body|subject|content|resume|mail|recipient|address|html|text/i;

const MAX_MESSAGE = 240;

type Sink = (level: LogLevel, line: string) => void;

const defaultSink: Sink = (level, line) => {
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
};

let sink: Sink = defaultSink;

// Tests replace the sink to capture output and to assert that nothing sensitive is written.
export function setLogSink(next: Sink | null): void {
    sink = next ?? defaultSink;
}

export function sanitizeFields(fields: LogFields): LogFields {
    const out: LogFields = {};
    for (const [key, value] of Object.entries(fields)) {
        if (!/_id$/.test(key) && DENIED_KEY.test(key)) continue;
        // Free text is scrubbed. Identifiers such as message ids are kept exactly, so a send can be traced.
        out[key] = typeof value === 'string' && /^error_|_message$/.test(key) ? scrub(value) : value;
    }
    return out;
}

// Removes email addresses and bearer credentials from free text, and caps its length.
export function scrub(value: string): string {
    const cleaned = value
        .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
    return cleaned.length > MAX_MESSAGE ? `${cleaned.slice(0, MAX_MESSAGE)}...` : cleaned;
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
    const record = {
        ts: new Date().toISOString(),
        level,
        event,
        ...sanitizeFields(fields),
    };
    sink(level, JSON.stringify(record));
}

export const logger = {
    info: (event: string, fields?: LogFields) => log('info', event, fields),
    warn: (event: string, fields?: LogFields) => log('warn', event, fields),
    error: (event: string, fields?: LogFields) => log('error', event, fields),
};

// Turns an unknown thrown value into loggable fields. Only the code and a scrubbed message are kept.
export function errorFields(error: unknown): LogFields {
    const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return { error_code: code ?? null, error_message: scrub(message) };
}
