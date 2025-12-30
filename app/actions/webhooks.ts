'use server'

export interface WebhookPayload {
    postId: string
    action: 'generate_image' | 'publish'
    platforms?: string[]
}

export async function sendToWebhook(payload: WebhookPayload) {
    // Determine which webhook URL to use based on action
    let webhookUrl: string

    if (payload.action === 'generate_image') {
        webhookUrl = process.env.NEXT_PUBLIC_N8N_GENERATE_IMAGE_WEBHOOK_URL || ''
    } else if (payload.action === 'publish') {
        webhookUrl = process.env.NEXT_PUBLIC_N8N_PUBLISH_POST_WEBHOOK_URL || ''
    } else {
        throw new Error(`Unknown action: ${payload.action}`)
    }

    if (!webhookUrl) {
        throw new Error(`Webhook URL for ${payload.action} not configured`)
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