// Local debugging of model input and output. Off unless LLM_DEBUG_PROMPT=true, and never on in production,
// because the input and output contain the candidate's profile and the email text.

export interface LlmDebugContext {
    stage: 'analysis' | 'application_email' | 'follow_up_email';
    jobId?: string | null;
    evidenceCount?: number;
    attempt?: number;
}

export function promptDebugEnabled(env: Record<string, string | undefined> = process.env): boolean {
    if (env.LLM_DEBUG_PROMPT !== 'true') return false;
    return env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production';
}

// Rough estimate for before the call. The exact count comes back from OpenAI after the call.
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export function formatPromptDebug(params: {
    model: string;
    context: LlmDebugContext;
    system: string;
    user: string;
}): string {
    const { model, context, system, user } = params;
    return [
        `[LLM DEBUG] stage=${context.stage} attempt=${context.attempt ?? 1}`,
        `model=${model}`,
        `job_id=${context.jobId ?? 'none'}`,
        `evidence_count=${context.evidenceCount ?? 0}`,
        `system_chars=${system.length}`,
        `user_chars=${user.length}`,
        `prompt_tokens_estimate=${estimateTokens(system) + estimateTokens(user)}`,
        '',
        '--- SYSTEM ---',
        system,
        '--- USER ---',
        user,
        '--- END LLM INPUT ---',
    ].join('\n');
}

export function formatOutputDebug(params: {
    context: LlmDebugContext;
    output: string;
    inputTokens?: number;
    outputTokens?: number;
}): string {
    return [
        `[LLM DEBUG] output stage=${params.context.stage} attempt=${params.context.attempt ?? 1}`,
        `prompt_tokens=${params.inputTokens ?? 'unknown'}`,
        `output_tokens=${params.outputTokens ?? 'unknown'}`,
        '--- OUTPUT ---',
        params.output,
        '--- END LLM OUTPUT ---',
    ].join('\n');
}
