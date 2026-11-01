// Decodes a raw RFC822 message source into text a classifier can read. Pure and IMAP-free, so it
// can be tested with a hand-built message source. Never throws -- returns null when nothing usable
// could be extracted, which the caller treats the same as "could not read the reply."

import { simpleParser } from 'mailparser';

export async function extractReplyText(source: Buffer | string): Promise<string | null> {
    try {
        const parsed = await simpleParser(source);
        const text = parsed.text?.trim();
        if (text) return text;

        const html = typeof parsed.html === 'string' ? parsed.html : '';
        const stripped = stripHtml(html).trim();
        return stripped || null;
    } catch {
        return null;
    }
}

// A rough approximation, not a renderer -- the classifier only needs the gist of the message.
function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
