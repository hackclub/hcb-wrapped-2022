const webhookUrl = process.env.SLACK_WEBHOOK;

export default async function handler (req, res) {
    await logData(req.params?.text || req.query?.text);
    res.send('OK');
}

export async function logData (data) {
    return await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: data
        })
    });
}