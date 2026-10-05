import nodemailer, { type Transporter } from 'nodemailer';

// SMTP settings come from the environment only. See .env.example.
//   SMTP_HOST          server hostname
//   SMTP_PORT          587 (STARTTLS) or 465 (implicit TLS). Default 587
//   SMTP_SECURE        "true" for implicit TLS (port 465). Default false
//   SMTP_REQUIRE_TLS   "true" refuses to send unless the connection is encrypted. Default true
//   SMTP_USER / SMTP_PASS
//   SMTP_FROM          sender address, optionally "Name <address@example.com>"

let transporter: Transporter | null = null;

export interface SmtpSettings {
    host: string;
    port: number;
    secure: boolean;
    requireTLS: boolean;
    user: string;
    pass: string;
    from: string;
}

export function readSmtpSettings(env: NodeJS.ProcessEnv = process.env): SmtpSettings {
    const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;
    const missing = required.filter((name) => !env[name]);
    if (missing.length > 0) {
        throw new Error(`SMTP is not configured. Missing: ${missing.join(', ')}`);
    }

    const port = Number(env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error('SMTP_PORT must be a positive integer');
    }

    return {
        host: env.SMTP_HOST!,
        port,
        secure: env.SMTP_SECURE === 'true',
        requireTLS: env.SMTP_REQUIRE_TLS !== 'false',
        user: env.SMTP_USER!,
        pass: env.SMTP_PASS!,
        from: env.SMTP_FROM!,
    };
}

function getTransporter(): Transporter {
    if (!transporter) {
        const settings = readSmtpSettings();
        transporter = nodemailer.createTransport({
            host: settings.host,
            port: settings.port,
            secure: settings.secure,
            requireTLS: settings.requireTLS,
            auth: { user: settings.user, pass: settings.pass },
        });
    }
    return transporter;
}

export interface OutgoingMessage {
    to: string;
    subject: string;
    text: string;
    messageId: string;
    inReplyTo?: string | null;
    references?: string | null;
    attachments?: { filename: string; content: Buffer; contentType: string }[];
}

// Resolves with the SMTP server's message id only when the server accepted the recipient.
// Callers must not mark an email as sent before this resolves.
export async function sendSmtpMessage(message: OutgoingMessage): Promise<string> {
    const settings = readSmtpSettings();

    const info = await getTransporter().sendMail({
        from: settings.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        messageId: message.messageId,
        inReplyTo: message.inReplyTo ?? undefined,
        references: message.references ?? undefined,
        attachments: message.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
        })),
    });

    const accepted = info.accepted.map(String);
    if (!accepted.includes(message.to)) {
        throw new Error(`The mail server did not accept ${message.to}`);
    }

    return info.messageId ?? message.messageId;
}
