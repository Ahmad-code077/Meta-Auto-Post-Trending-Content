// Derives a Gmail deep link from a stored Message-ID, at render time. Nothing about the reply is
// stored beyond the id itself (see reply_message_id) -- this link is the only way to read the reply.
//
// Uses Gmail's rfc822msgid search operator rather than #inbox/<id> -- #inbox/<id> only resolves if
// the message is still in the Inbox view with that exact state loaded client-side; it does not
// reliably open the message by id and was observed opening an empty inbox instead. #search/rfc822msgid:
// finds the message by its real Message-ID regardless of which label/folder it's actually in.

export function gmailReplyLink(messageId: string): string {
    const stripped = messageId.trim().replace(/^<|>$/g, '');
    return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(stripped)}`;
}
