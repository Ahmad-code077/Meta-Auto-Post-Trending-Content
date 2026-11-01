// IMAP provider for the inbox sync. Read-only: the bulk scan (listRecent) fetches only headers with
// BODY.PEEK, so messages are not marked as read and no body is downloaded. fetchBody downloads one
// message's body, also via BODY.PEEK, and only for a message that already matched a sent
// application -- see lib/inbox/sync.ts and lib/inbox/classify-reply.ts for what that body is used for.
//
// Settings (IMAP_*) fall back to the SMTP account, which for Gmail is the same mailbox with an app password.

import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { addressOf, parseHeaderBlock } from './headers';
import { extractReplyText } from './body';
import { readSmtpSettings, resolveSender } from '@/lib/mail/smtp';
import { logger, errorFields } from '@/lib/log/logger';
import type { InboxProvider } from './sync';
import type { InboundMessage } from './match';

export interface ImapSettings {
    host: string;
    port: number;
    user: string;
    pass: string;
}

export function readImapSettings(env: NodeJS.ProcessEnv = process.env): ImapSettings {
    const user = env.IMAP_USER || env.SMTP_USER;
    const pass = env.IMAP_PASS || env.SMTP_PASS;
    if (!user || !pass) {
        throw new Error('IMAP is not configured. Set IMAP_USER and IMAP_PASS, or rely on SMTP_USER and SMTP_PASS.');
    }
    return {
        host: env.IMAP_HOST || 'imap.gmail.com',
        port: Number(env.IMAP_PORT || 993),
        user,
        pass,
    };
}

export function createImapInboxProvider(settings: ImapSettings): InboxProvider {
    return {
        async listRecent(since) {
            const client = new ImapFlow({
                host: settings.host,
                port: settings.port,
                secure: true,
                auth: { user: settings.user, pass: settings.pass },
                logger: false,
            });

            try {
                await client.connect();
            } catch (error) {
                logger.error('inbox.imap.connect_failed', { host: settings.host, port: settings.port, ...errorFields(error) });
                throw error;
            }
            logger.info('inbox.imap.connected', { host: settings.host, port: settings.port });

            const lock = await client.getMailboxLock('INBOX');
            try {
                const uids = await client.search({ since }, { uid: true });
                logger.info('inbox.imap.searched', { since: since.toISOString(), uid_count: uids ? uids.length : 0 });
                if (!uids || uids.length === 0) return [];

                const messages: InboundMessage[] = [];
                for await (const msg of client.fetch(uids.join(','), {
                    uid: true,
                    envelope: true,
                    headers: ['in-reply-to', 'references', 'auto-submitted', 'x-autoreply', 'precedence'],
                }, { uid: true })) {
                    messages.push(toInbound(msg));
                }
                return messages;
            } finally {
                lock.release();
                await client.logout();
            }
        },

        // Called only for a message that already matched a sent application. Fetches the full
        // source with BODY.PEEK (imapflow always uses PEEK for source/bodyParts fetches, the same
        // guarantee listRecent relies on -- this does not mark the message as read) and decodes it.
        // Returns null on any failure: a missing body is never treated as a reason to act.
        async fetchBody(uid: number) {
            const client = new ImapFlow({
                host: settings.host,
                port: settings.port,
                secure: true,
                auth: { user: settings.user, pass: settings.pass },
                logger: false,
            });

            try {
                await client.connect();
            } catch (error) {
                logger.error('inbox.imap.connect_failed', { host: settings.host, port: settings.port, ...errorFields(error) });
                return null;
            }

            const lock = await client.getMailboxLock('INBOX');
            try {
                const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
                if (!msg || !msg.source) return null;
                return await extractReplyText(msg.source);
            } catch (error) {
                logger.error('inbox.imap.fetch_body_failed', { uid, ...errorFields(error) });
                return null;
            } finally {
                lock.release();
                await client.logout();
            }
        },
    };
}

function toInbound(msg: FetchMessageObject): InboundMessage {
    const headers = parseHeaderBlock(msg.headers ? msg.headers.toString('utf8') : '');
    const fromAddress = msg.envelope?.from?.[0]?.address ?? null;
    const autoSubmitted = headers['auto-submitted'] !== undefined && headers['auto-submitted'].toLowerCase() !== 'no';
    const precedence = (headers['precedence'] ?? '').toLowerCase();
    const bulk = precedence === 'bulk' || precedence === 'auto_reply' || precedence === 'list';
    const noReply = /mailer-daemon|postmaster|no-?reply/i.test(fromAddress ?? '');

    return {
        uid: msg.uid,
        messageId: msg.envelope?.messageId ?? null,
        inReplyTo: headers['in-reply-to'] ?? null,
        references: headers['references'] ?? null,
        from: addressOf(fromAddress),
        subject: msg.envelope?.subject ?? null,
        date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
        automated: autoSubmitted || bulk || noReply || headers['x-autoreply'] !== undefined,
    };
}

// Our own sending address. Mail from it is never a reply. This is SMTP_USER, the account that actually
// sends (see resolveSender in lib/mail/smtp.ts) -- not SMTP_FROM, which may only hold a display name.
export function senderAddressFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
    try {
        return resolveSender(readSmtpSettings(env)).address;
    } catch {
        return addressOf(env.SMTP_FROM ?? null);
    }
}
