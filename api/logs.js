const webhookUrl = `https://hooks.slack.com/workflows/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`;

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