import api from './api.js';
import persist from './persistLs.js';

window.dom = new Proxy({ fn: document.querySelector.bind(document) }, {
    get ({ fn }, target) {
        return target == '$' ? fn : fn(target);
    }
});

persist();

async function handlePromise (promise) {
    if (promise instanceof Promise) await promise;
    return promise;
}

async function pager (getPage, endCriteria, handlePages, upperLimit) {
    const pages = [];
    for (let i = 0; !upperLimit || i < upperLimit; i++) {
        const pageData = await handlePromise(getPage(i + 1));
        pages.push(pageData);
        const done = endCriteria(pageData);
        if (done) break;
    }

    return handlePages(pages);
}

function pulse () {
    console.log('Pulse');
}

const loadingPhrases = () => [
    'Following the money',
    'Sifting through the data',
    'Tallying up holiday cheer',
    'Decking the halls',
    'Counting down the days',
    [ 'Making a list', 'Checking it twice' ],
    'Printing receipts'
].sort(() => Math.random() - 0.5).flat();

export class Wrapped {
    constructor (userId, orgSlugs, year = 2022) {
        this.userId = userId;
        this.orgSlugs = orgSlugs;
        this.year = year;

        this.data = {
            collaborators: [],
            orgs: 0,
            global_transactions_cents: 0,
            keywords: []
        };

        this.metrics = {};
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

        this.data.orgs++;
    }
    
    async fetch () {
        for (const org of this.orgSlugs) {
            const orgData = await api.v3.organizations[org].get();
            const transactions = await pager(page => (pulse(), api.v3.organizations[org].transactions.searchParams({ per_page: 100, page: page }).get()), page => {
                return page.filter(tx => {
                    let year = new Date(tx.date).getFullYear();
                    return year < this.year;
                }).length != 0 || !page.length;
            }, pages => pages.flat());
            this.#indexOrg(orgData, transactions);
        }
    }

    wrap () {
        const keywordsMap = new Map([...new Map([ ...new Set(this.data.keywords) ].map(keyword => [keyword, this.data.keywords.filter(k => k == keyword).length])).entries()].sort((a, b) => b[1] - a[1]));
        const keywordsObject = Object.fromEntries([...keywordsMap.keys()].filter((_, i) => i <= 10).map(keyword => [keyword, keywordsMap.get(keyword)]));

        this.metrics = {
            collaborators: this.data.collaborators.length,
            orgs: this.data.orgs,
            transactions_cents: this.data.global_transactions_cents,
            top_keywords: keywordsObject
        };

        return this.metrics;
    }
}

let loading = false;
let phrases = loadingPhrases();
const myWrapped = new Wrapped('usr_BetQLy', ['assemble', 'hackoc', 'epoch-ba']);

function run () {
    loading = true;
    phrases = loadingPhrases();
    myWrapped.fetch().then(() => {
        dom['code.output .data'].innerText = (JSON.stringify(myWrapped.wrap(), null, 4));
        loading = false;
        dom['.loading'].innerText = '';
    });
}

setInterval(() => {
    if (loading) dom['.loading'].innerText = '\n' + phrases[(Math.floor(Date.now() / 3000)) % phrases.length] + '...';
}, 1000);

dom['.config'].onsubmit = e => {
    e.preventDefault();
    run();
    dom['.wrap'].disabled = true;
}