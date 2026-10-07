// User-facing wording for follow-up outcomes. Raw error text is never shown. Only these mapped sentences are.

// Failures where the email may already have been delivered, so the user must check before resending.
const CHECK_SENT_FOLDER = 'The connection dropped while sending. The email may have been delivered, so check your sent folder before resending.';

const FAILURE_TEXT: Record<string, string> = {
    GENERATION_FAILED: 'The follow-up text could not be written. Nothing was sent.',
    VALIDATION_FAILED: 'The follow-up text could not be verified against your profile. Nothing was sent.',
    ECONNECTION: 'The mail server could not be reached. Nothing was sent.',
    EDNS: 'The mail server address could not be found. Nothing was sent.',
    EAUTH: 'The mail server rejected the login. Check the SMTP settings, then retry.',
    EENVELOPE: 'The recipient address was rejected.',
    NO_PREVIOUS_SENT: 'No earlier sent email exists for this job.',
    ETIMEDOUT: CHECK_SENT_FOLDER,
    ESOCKET: CHECK_SENT_FOLDER,
    STALE_CLAIM: 'The sending process stopped before it confirmed delivery. Check your sent folder before resending.',
    SMTP_FAILED: 'The mail server did not confirm delivery. Check your sent folder before resending.',
};

const CANCEL_TEXT: Record<string, string> = {
    CANCELLED_BY_USER: 'Cancelled by you.',
    SUPERSEDED: 'Replaced by a follow-up that was sent.',
    JOB_NOT_AWAITING_REPLY: 'The application no longer awaited a reply.',
    RECIPIENT_REPLIED: 'The recruiter replied, so follow-ups stopped.',
};

export function failureReason(errorCode: string | null | undefined): string {
    return FAILURE_TEXT[errorCode ?? ''] ?? 'The follow-up failed.';
}

export function cancellationReason(errorCode: string | null | undefined): string | null {
    return CANCEL_TEXT[errorCode ?? ''] ?? null;
}
