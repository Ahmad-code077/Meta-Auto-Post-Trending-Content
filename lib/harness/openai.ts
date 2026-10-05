// Minimal client for the OpenAI Responses API with strict JSON-schema output.
// The harness only needs one call shape, so a direct fetch keeps the dependency list short.

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

interface StructuredRequest {
    name: string;
    schema: Record<string, unknown>;
    instructions: string;
    input: string;
}

export async function generateStructured<T>({ name, schema, instructions, input }: StructuredRequest): Promise<T> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            instructions,
            input,
            store: false,
            text: {
                format: { type: 'json_schema', name, schema, strict: true },
            },
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        console.error('OpenAI request failed:', response.status, detail);
        throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as ResponsePayload;
    const text = extractOutputText(payload);
    if (!text) {
        throw new Error('OpenAI returned no content');
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error('OpenAI returned invalid JSON');
    }
}

interface ResponsePart {
    type?: string;
    text?: string;
}

interface ResponsePayload {
    output_text?: string;
    output?: { content?: ResponsePart[] }[];
}

function extractOutputText(payload: ResponsePayload): string | null {
    if (typeof payload.output_text === 'string') return payload.output_text;

    for (const item of payload.output ?? []) {
        for (const part of item.content ?? []) {
            if (part.type === 'refusal') {
                throw new Error('The model declined to write this email');
            }
            if (part.type === 'output_text' && typeof part.text === 'string') {
                return part.text;
            }
        }
    }
    return null;
}
