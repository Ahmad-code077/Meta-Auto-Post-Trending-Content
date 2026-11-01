// Derives a Gmail deep link from a stored Message-ID, at render time. Nothing about the reply is
// stored beyond the id itself (see reply_message_id) -- this link is the only way to read the reply.

export function gmailReplyLink(messageId: string): string {
    const stripped = messageId.trim().replace(/^<|>$/g, '');
    return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(stripped)}`;
}
