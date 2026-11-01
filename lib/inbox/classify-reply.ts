// Classifies a recruiter's reply so the scheduler knows whether to keep following up. The only
// model call in lib/inbox -- everything else here is deterministic header matching.

import { generateStructured } from '@/lib/harness/openai';

export type ReplyClassification = 'engaged' | 'holding' | 'rejected' | 'auto_reply';

// Injectable for tests. Defaults to the real OpenAI client, same pattern as ModelCall in lib/harness/write.ts.
export type ClassifyModelCall = (params: Parameters<typeof generateStructured>[0]) => Promise<{ classification: string }>;

const CLASSIFICATIONS: readonly ReplyClassification[] = ['engaged', 'holding', 'rejected', 'auto_reply'];

const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['classification'],
    properties: {
        classification: { type: 'string', enum: CLASSIFICATIONS },
    },
} as const;

const INSTRUCTIONS = `You classify a recruiter's reply to a job application email. Decide which single category it belongs to.

Categories:
- "engaged": The reply invites a next step -- a call, an interview, a screening, a request for more information or availability, or any other sign that a person is actively moving this application forward. A question back to the candidate counts, even a short one.
- "rejected": The reply explicitly declines, says the candidate was not selected, says the role was filled, or says the company is moving forward with other candidates. Only use this when the decline is clear -- do not infer rejection from a neutral or noncommittal tone alone.
- "auto_reply": The text itself reveals it is a generated acknowledgment, not something a person composed for this candidate. This includes phrases like "this is an automated message," "confirmation of receipt," "do not reply to this email," a ticket/reference number, or a generic template with no first-person voice and nothing specific to this candidate or conversation. It also includes any message, however politely worded, whose only content is that the application was received and/or will be reviewed or processed internally -- "we have received your application," "your application will be reviewed," "will review it shortly" -- with no stated promise that anyone will contact the candidate again about the outcome.
- "holding": Everything else -- a real person's reply that doesn't fit the three categories above. The one signal that reliably separates this from auto_reply is an explicit promise of further contact: "get back to you," "follow up," "be in touch," "let you know," or similar -- a promise that someone will reach out again, as opposed to merely reviewing or processing the application internally. A message with that promise is holding even if it is otherwise short and generic. A message describing only an internal step (received, reviewed, processed, considered) with no promise of renewed contact is auto_reply, not holding, even if it is polite or uses "we."

If a reply reads as ambiguous between "holding" and "auto_reply," prefer "holding" -- the two are treated identically downstream (follow-ups continue either way), so precision there is about accurate labeling for the person reading their own history, not about any consequence. The boundary that matters is "engaged"/"rejected" versus the other two, since that boundary decides whether automatic follow-ups stop. When genuinely unsure whether a reply means engagement or rejection, classify it as "holding" rather than guessing -- an unresolved application should keep getting followed up on, not be silently closed out on a guess.

Base your answer only on the text of the reply. Do not use anything outside the reply itself to decide the category.`;

// Never throws. Any failure -- no API key, a model/network error, or an unparseable response --
// falls back to "holding", the one outcome that changes nothing and is always safe to leave for a
// later run or a person to reconsider. The caller never needs to handle a rejected promise here.
export async function classifyReply(
    body: string,
    call: ClassifyModelCall = (params) => generateStructured(params)
): Promise<ReplyClassification> {
    const text = body.trim();
    if (!text) return 'holding';

    try {
        const result = await call({
            name: 'reply_classification',
            schema: SCHEMA,
            instructions: INSTRUCTIONS,
            input: `Reply:\n"""\n${text}\n"""`,
            debug: { stage: 'reply_classification' },
        });

        return (CLASSIFICATIONS as readonly string[]).includes(result.classification)
            ? (result.classification as ReplyClassification)
            : 'holding';
    } catch {
        return 'holding';
    }
}
