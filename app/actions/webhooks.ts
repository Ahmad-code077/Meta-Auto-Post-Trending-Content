'use server'

export interface WebhookPayload {
    postId: string
    action: 'generate_image' | 'publish'
    platforms?: string[]
}

export async function sendToWebhook(payload: WebhookPayload) {
    const webhookUrl = process.env.N8N_WEBHOOK_URL

    if (!webhookUrl) {
        throw new Error('Webhook URL not configured')
    }

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.N8N_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`)
    }

    return await response.json()
}