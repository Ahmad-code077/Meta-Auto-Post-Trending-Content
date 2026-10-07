// IMAP provider for the inbox sync. Read-only: it searches the inbox and fetches headers with BODY.PEEK,
// so messages are not marked as read and no body is downloaded.
//
// Settings (IMAP_*) fall back to the SMTP account, which for Gmail is the same mailbox with an app password.

import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { addressOf, parseHeaderBlock } from './headers';
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
