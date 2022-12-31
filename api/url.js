const webhookUrl = process.env.SLACK_WEBHOOK;

export default async function handler (req, res) {
    await logUrl(req.params?.url || req.query?.url);
}

export async function logUrl (data) {
    return await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: JSON.stringify(data)
        })
    });
}