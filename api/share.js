export default function handler (req, res) {
    const data = req.query?.q ?? req.query?.path;
    if (!data) return res.redirect('https://bank.hackclub.com/wrapped');
    res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="/hc.css"></link>
        <meta property="og:image" content="https://workshop-cards.hackclub.com/${encodeURIComponent(data.split('_').reverse()[0] + '\'s')}.png?theme=dark&fontSize=225px&caption=Bank%2520Wrapped%25202022&brand=Bank">
        <meta property="og:title" content="Bank Wrapped">
        <meta property="og:description" content="Watch ${data.split('_').reverse()[0].replace(/[\u00A0-\u9999<>\&]/g, ((i) => `&#${i.charCodeAt(0)};`))}'s Bank Wrapped for 2022">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="theme-color" content="#ec3750">
        <title>Bank Wrapped</title>
        <style>
            * {
                box-sizing: border-box;
            }
    
            html, body, div.wrapper, div.bg-wrapper {
                margin: 0px;
                padding: 0px;
                height: 100%;
                width: 100%;
            }
    
            div.bg-wrapper {
                position: absolute;
                z-index: 4;
                top: 0px;
                left: 0px;
                overflow: hidden;
            }
    
            body {
                background: var(--red);
            }
    
            div.wrapper {
                z-index: 19;
                position: relative;
                display: flex;
                justify-content: center;
                align-items: center;
            }
    
            div.main {
                background: white;
                padding: var(--spacing-5);
                display: flex;
                justify-content: center;
                align-items: center;
                border-radius: 16px;
                box-shadow: 0px 0px 20px 0px #3403095e;
                width: calc(100vw - 100px);
                min-width: 300px;
                max-width: 600px;
                position: relative;
                top: 0px;
                left: 0px;
                z-index: 20;
            }
    
            div.content {
                text-align: center;
            }
    
            div.bg {
                background: url("/assets/freeze.svg");
                background-repeat: space;
                background-size: 80px 80px;
                color: white;
                z-index: 5;
                position: absolute;
                top: 0px;
                width: 200vw;
                height: 200vh;
                left: 0px;
                transform: rotate(20deg) translate(-25%, -25%);
            }
    
            div.footer {
                position: absolute;
                bottom: 0px;
                left: 0px;
                width: 100%;
                padding: var(--spacing-3);
                text-align: center;
                color: white;
                z-index: 11;
            }
    
            div.inner-footer {
                background: #ec374f92;
                display: inline-block;
                box-shadow: 0px 0px 40px 0px #ec374f92;
                padding: 16px;
                position: relative;
                top: 0px;
                left: 0px;
                z-index: 15;
            }
    
            div.inner-footer * {
                color: white;
            }
    
            div.progress {
                width: 100%;
                height: 32px;
                border: 4px solid var(--smoke);
                background: var(--snow);
                border-radius: 16px;
            }
    
            div.progress > div.meter {
                height: 100%;
                background: var(--red);
                width: min(max(calc(var(--value) * 100%), 60px), 100%);
                transition: width 0.5s;
                border-radius: 16px;
                color: white;
                font-size: 10px;
            }
    
            div.meter > p {
                color: white;
                vertical-align: top;
                display: inline-block;
                margin: 0px;
                padding: 0px;
                font-size: 18px;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="main">
                <div class="content">
                    <h1 class="title"><span style="color: var(--red);">Bank</span> Wrapped</h1>
                    <h2 class="headline" style="margin-bottom: var(--spacing-5);">🏦 🎁 2022</h2>
                    <h3 class="eyebrow">Redirecting...</h3>
                </div>
            </div>
        </div>
        <div class="bg-wrapper">
            <div class="bg"></div>
        </div>
        <div class="footer">
            <div class="inner-footer">
                <p>Bank Wrapped 2022<span style="white-space: pre;">  |  </span><a href="https://bank.hackclub.com" target="_blank">Hack Club Bank</a><span style="white-space: pre;">  |  </span><a href="https://github.com/hackclub/bank-wrapped" target="_blank">Source Code</a></p>
            </div>
        </div>
        <script>
            const params = new URL(window.location.href).searchParams;
    
            if (!params.has('q') && false) window.location.replace('https://bank.hackclub.com/wrapped');
            else {
                const q = params.get('q');
    
                const [userId, ...orgIds] = q.split('_').map((id, i) => i == 0 ? 'usr_' + id : 'org_' + id);
                
                const name = decodeURIComponent(orgIds.pop().substring(4));
    
                window.location.replace(\`https://bank-wrapped.hackclub.com?shared=true&user_id=\${userId}&org_ids=\${orgIds.join(',')}\${name != '0' ? \`&name=\${name}\` : ''}\`)
            }
        </script>
    </body>
    </html>`)
}