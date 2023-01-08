export default function handler (req, res) {
    res.redirect(`https://workshop-cards.hackclub.com/${encodeURIComponent(req.query.name + '\'s')}.png?theme=dark&fontSize=225px&caption=Bank%2520Wrapped%25202022&brand=Bank`);
}