import api from './api.js';

window.dom = new Proxy({ fn: document.querySelector.bind(document) }, {
    get ({ fn }, target) {
        return target == '$' ? fn : fn(target);
    }
});

window.html = ((strings, ...values) => {
    let html = '';
    strings.forEach((string, i) => {
        html += string;
        if (values[i]?.replace) html += values[i].replace(/[\u00A0-\u9999<>\&]/g, ((i) => `&#${i.charCodeAt(0)};`))
    });
    return html;
});

window.__stored_fn = {};

window.fn = (fn) => {
    const key = '__stored_fn_' + Date.now() + Math.floor(Math.random() * 10000);
    window[key] = fn;
    return key;
}

const params = object => '?' + Object.entries(object).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

async function flattenPotentialPromise (promise) {
    if (promise instanceof Promise) await promise;
    return promise;
}

async function pager (getPage, endCriteria, handlePages, upperLimit) {
    const pages = [];
    for (let i = 0; !upperLimit || i < upperLimit; i++) {
        const pageData = await flattenPotentialPromise(getPage(i + 1));
        pages.push(pageData);
        const done = endCriteria(pageData);
        if (done) break;
    }

    return handlePages(pages);
}

async function setWordCloud (url) {
    const res = await fetch(url);
    const svg = await res.text();
    dom['.wordcloud'].innerHTML = svg;
    dom['.wordcloud'].style.fontWeight = 'bold';
    dom['.wordcloud svg'].setAttribute('font-family', 'Phantom Sans');
}

export class Wrapped {
    constructor (userId, orgSlugs, screens = {}, year = 2022) {
        this.userId = userId;
        this.orgSlugs = orgSlugs;
        this.year = year;

        this.screens = Object.values(screens);
        this.currentScreen = -1;

        this.data = {
            collaborators: [],
            global_transactions_cents: 0,
            keywords: [],
            image_url: '',
            orgs: []
        };

        this.metrics = {};

        this.orgsCompleted = 0;
        this.isLargeOrg = false;
        this.orgUpdateMs = Date.now();
    }

    nextScreen () {
        this.currentScreen++;
        const value = this.screens[this.currentScreen](this.metrics);
        dom['.content'].innerHTML = value;
    }

    #reactiveUpdate (value) {
        const percentage = value ?? Math.floor((((Date.now() - this.orgUpdateMs) / 5000) + (this.orgsCompleted) / this.orgSlugs.length * 100) * 100) / 100;
        dom['#loading-value'].innerText = percentage;
        dom['.meter'].setAttribute('style', `--value: ${percentage / 100};`);
    }

    #indexOrg (orgData, transactions) {
        for (const member of orgData.users) {
            if (member.id == this.userId) this.data.name = member.full_name;
            if (!this.data.collaborators.includes(member.id)) this.data.collaborators.push(member.id);
        }

        this.data.global_transactions_cents += transactions.reduce((acc, tx) => acc + Math.abs(tx.amount_cents), 0);
        
        for (const transaction of transactions) {
            this.data.keywords.push(...transaction.memo.toLowerCase().split('').filter(char => `abcdefghijklmnopqrstuvwxyz1234567890_- `.includes(char)).join('').split(' ').filter(k => k).filter(k => ![
                'the',
                'of',
                'and',
                'to',
                'in',
                'is',
                'for',
                'from',
                'a'
            ].includes(k)));
        }
console.log(transactions);
        const amountSpent = transactions.reduce((acc, tx) => acc + (tx.type == "card_charge" && tx.card_charge.user.id == this.userId ? Math.abs(tx.amount_cents) : 0), 0);

        this.data.orgs.push({
            name: orgData.name,
            amountSpent,
        });
    }
    
    async fetch () {
        this.orgUpdateMs = Date.now();

        const interval = setInterval(() => this.#reactiveUpdate(), 200);

        const asyncFns = [];

        for (const org of this.orgSlugs) {
            asyncFns.push((async () => {

                this.isLargeOrg = org == 'hq';
                const [orgData, transactions] = await Promise.all([
                    await api.v3.organizations[org].get(),
                    await pager(page => (this.orgUpdates++, api.v3.organizations[org].transactions.searchParams({ per_page: 500, page: page, expand: 'card_charge' }).get()), page => {
                        return page.filter(tx => {
                            let year = new Date(tx.date).getFullYear();
                            return year < this.year;
                        }).length != 0 || !page.length;
                    }, pages => pages.flat())
                ]);
                this.orgsCompleted++;
                // this.orgUpdates = 0;
                // this.orgUpdateMs = Date.now();
                this.#indexOrg(orgData, transactions);

            })());
        }

        await Promise.all(asyncFns);

        const keywordsMap = new Map([...new Map([ ...new Set(this.data.keywords) ].map(keyword => [keyword, this.data.keywords.filter(k => k == keyword).length])).entries()].sort((a, b) => b[1] - a[1]));
        const keywordsObject = Object.fromEntries([...keywordsMap.keys()].filter((keyword, i) => keywordsMap.get(keyword) > 5 && i <= 30).map(keyword => [keyword, keywordsMap.get(keyword)]));

        const keywordsList = Object.entries(keywordsObject).map(([keyword, count]) => ' '.repeat(count).split('').map(_ => keyword)).flat();

        this.data.keywords_object = keywordsObject;

//         setWordCloud('https://quickchart.io/wordcloud' + params({
//             text: keywordsList.slice(0, 500).join(' '),
//             colors: JSON.stringify(`#ec3750
// #ff8c37
// #f1c40f
// #33d6a6
// #5bc0de
// #338eda
// #a633d6`.split('\n')),
//             nocache: Date.now()
//         }));

        clearInterval(interval);
        this.#reactiveUpdate(100);

        this.#wrap();

        dom['.eyebrow'].innerHTML =  html`
            <h3 class="eyebrow">Welcome, <span style="color: var(--slate);">${this.data.name}</span>!</h3>
        `;
    }

    #wrap () {
        this.metrics = {
            collaborators: this.data.collaborators.length,
            orgs: this.data.orgs.length,
            amountSpent: this.data.orgs.reduce((acc, org) => acc + org.amountSpent, 0),
            mostSpentOrg: this.data.orgs.sort((a, b) => b.amountSpent - a.amountSpent)[0].name,
            transactions_cents: this.data.global_transactions_cents,
            top_keywords: this.data.keywords_object,
            name: this.data.name,
            percent: this.data.percent
        };

        return this.metrics;
    }
}

const searchParams = new URLSearchParams(window.location.search);

const screens = {
    loading ({ name }) {
        return html`
            <h1 class="title"><span style="color: var(--red);">Bank</span> Wrapped</h1>
            <h2 class="headline" style="margin-bottom: var(--spacing-5);">🏦 🎁 2022</h2>
            <div class="progress" style="margin-bottom: var(--spacing-2);">
                <div class="meter" style="--value:1;">
                    <p>
                        <span id="loading-value">100</span>%
                    </p>
                </div>
            </div>
            <h3 class="eyebrow">Welcome, <span style="color: var(--slate);">${name}</span>!</h3>
        `;
    }
}

const myWrapped = new Wrapped(searchParams.get('user_id'), searchParams.get('org_ids')?.split(',').sort(() => Math.random() - 0.5), screens);

function run () {
    myWrapped.fetch().then(() => {
    });
}

run();

document.body.innerHTML += html`
    <div style="position: absolute; top: 0px; left: 0px; width: 100%; height: 100%; z-index: 200; background: white; display: flex; justify-content: center; align-items: center;">
        <h1>Thanks for helping to test!</h1>
    </div>
` // temp for testing
window.history.pushState({}, '', '/wrapped');