const webhookUrl = process.env.SLACK_WEBHOOK;

export default async function handler (req, res) {
    await log(req.body);
}

export async function log (data) {
    return await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: JSON.stringify(data, null, 2)
        })
    });
}