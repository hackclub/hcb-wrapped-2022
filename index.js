import api from './api.js';

window.dom = new Proxy({ fn: document.querySelector.bind(document) }, {
    get ({ fn }, target) {
        return target == '$' ? fn : fn(target);
    }
});

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
    constructor (userId, orgSlugs, year = 2022) {
        this.userId = userId;
        this.orgSlugs = orgSlugs;
        this.year = year;

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

    #reactiveUpdate (value) {
        const percentage = value ?? Math.floor((((Date.now() - this.orgUpdateMs) / 5000) + (this.orgsCompleted) / this.orgSlugs.length * 100) * 100) / 100;
        dom['#loading-value'].innerText = percentage;
        dom['.meter'].setAttribute('style', `--value: ${percentage / 100};`);
    }

    #indexOrg (orgData, transactions) {
        for (const member of orgData.users) {
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

        const amountSpent = 0 // transactions.reduce((acc, tx) => acc + (tx.type == "card_charge" && tx.card_charge.user.id == this.userId ? Math.abs(tx.amount_cents) : 0), 0);
        // not working right now since user isn't uncluded
        // TODO: fix that
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
                    await pager(page => (this.orgUpdates++, api.v3.organizations[org].transactions.searchParams({ per_page: 100, page: page }).get()), page => {
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

        setWordCloud('https://quickchart.io/wordcloud' + params({
            text: keywordsList.slice(0, 500).join(' '),
            colors: JSON.stringify(`#ec3750
#ff8c37
#f1c40f
#33d6a6
#5bc0de
#338eda
#a633d6`.split('\n')),
            nocache: Date.now()
        }));

        this.#reactiveUpdate(100);
        clearInterval(interval);
    }

    wrap () {
        this.metrics = {
            collaborators: this.data.collaborators.length,
            orgs: this.data.orgs.length,
            amountSpent: this.data.orgs.reduce((acc, org) => acc + org.amountSpent, 0),
            mostSpentOrg: this.data.orgs.sort((a, b) => b.amountSpent - a.amountSpent)[0].name,
            transactions_cents: this.data.global_transactions_cents,
            top_keywords: this.data.keywords_object
        };

        return this.metrics;
    }
}

const searchParams = new URLSearchParams(window.location.search);

const myWrapped = new Wrapped(searchParams.get('user_id'), searchParams.get('org_ids')?.split(',').sort(() => Math.random() - 0.5));

function run () {
    myWrapped.fetch().then(() => {
        console.log(myWrapped.wrap());
    });
}

run();