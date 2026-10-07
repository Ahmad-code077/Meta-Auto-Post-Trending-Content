// Parsing of the few headers the inbox sync reads. Only identifiers and addresses are kept.

// "<ABC@example.com>" -> "abc@example.com". Message ids are compared case-insensitively.
export function normalizeMessageId(value: string): string {
    return value.trim().replace(/^<|>$/g, '').toLowerCase();
}

// All message ids in a header value, such as the References header, which lists several.
export function extractMessageIds(value: string | null | undefined): string[] {
    if (!value) return [];
    const ids = value.match(/<[^<>\s]+>/g) ?? [];
    return [...new Set(ids.map(normalizeMessageId).filter(Boolean))];
}

// Lowercased address from "Name <a@b.com>" or a bare "a@b.com". Returns null when there is none.
export function addressOf(value: string | null | undefined): string | null {
    if (!value) return null;
    const angled = value.match(/<([^<>\s]+@[^<>\s]+)>/);
    const bare = value.match(/[^\s<>",;]+@[^\s<>",;]+/);
    const found = angled?.[1] ?? bare?.[0] ?? null;
    return found ? found.toLowerCase() : null;
}

// Parses a raw header block into lowercase names. Folded lines (starting with whitespace) are joined.
export function parseHeaderBlock(raw: string): Record<string, string> {
    const headers: Record<string, string> = {};
    let currentName: string | null = null;

    for (const line of raw.split(/\r?\n/)) {
        if (/^\s/.test(line) && currentName) {
            headers[currentName] += ` ${line.trim()}`;
            continue;
        }
        const colon = line.indexOf(':');
        if (colon <= 0) {
            currentName = null;
            continue;
        }
        currentName = line.slice(0, colon).trim().toLowerCase();
        if (!(currentName in headers)) {
            headers[currentName] = line.slice(colon + 1).trim();
        }
    }
    return headers;
}
