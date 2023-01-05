import api from './api.js';

window.dom = new Proxy({ fn: document.querySelector.bind(document) }, {
    get ({ fn }, target) {
        return target == '$' ? fn : fn(target);
    }
});

window.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

window.html = ((strings, ...values) => {
    let html = '';
    strings.forEach((string, i) => {
        html += string;
        if (values[i]?.replace || values[i]?.toString) html += values[i].toString().replace(/[\u00A0-\u9999<>\&]/g, ((i) => `&#${i.charCodeAt(0)};`))
    });
    return html;
});

window.__stored_fn = {};

window.fn = (fn) => {
    const key = '__stored_fn_' + Date.now() + Math.floor(Math.random() * 10000);
    window[key] = fn;
    return key;
}

Number.prototype.$range = function () {
    return Array.from({ length: this }, (_, i) => i + 1);
}

const params = object => '?' + Object.entries(object).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

async function flattenPotentialPromise (promise) {
    if (promise instanceof Promise) await promise;
    return promise;
}

function altFetch (url) {
    /**
     * I have to use XMLHttpRequest 💀
     * https://stackoverflow.com/questions/43344819/reading-response-headers-with-fetch-api
     */
    return new Promise((resolve, reject) => {

        function responseListener () {
            console.log(this.responseText);
            console.log(this.getAllResponseHeaders());
        }
        
        const req = new XMLHttpRequest();
        req.addEventListener("load", responseListener);
        req.open("GET", url);
        req.send();
    });
}

window.altFetch = altFetch;

async function strategicFetcher (orgs, globalYear = new Date().getFullYear()) {
    function stackSegment (stack, index, number) {
        const output = [];
        for (let i = 0; i < number; i++) {
            if (stack[index + i]) output.push(stack[index + i]());
        }
        return output;
    }

    async function fetchOrg (org) {
        async function fetchPage (page) {
            const { parsed, raw: { headers } } = await api.v3.organizations[org].transactions.searchParams({ per_page: 150, page, expand: 'card_charge' }).get_raw()
            const pageNumber = headers.get('X-Page');
            const nextPage = headers.get('X-Next-Page');
            const totalPages = headers.get('X-Total-Pages');

            return { data: parsed, pageNumber, nextPage, totalPages };
        }

        let output = [];
        let stack = [];
        let completed = false;
        
        const { data, totalPages } = await fetchPage(1);
        output.push(...data);

        if (totalPages == 1) return output;

        function pushStack (page) {
            stack.push(async () => {
                if (completed) return [];
                const { data, nextPage, totalPages } = await fetchPage(page);

                if (nextPage == null) completed = true;

                if (data.filter(tx => {
                    let year = new Date(tx.date).getFullYear();
                    return year < globalYear;
                }).length != 0 || !data.length) completed = true;

                return data;
            });
        }

        /**
         * This setup allows for 5 requests to run at one time.
         * This is great compared to waiting for 500 records one
         * at a time, however it has some drawbacks. If, for example,
         * the first 4 requests complete in 500ms, but the last
         * request takes 20 seconds, the script will rait 20 seconds
         * before loading another 5 pages. This could be solved
         * with a system of 5 runners that pop and fetch requests
         * from the stack, however the performance gain is minimal. 
         */

        for (let i = 2; i <= totalPages; i++) {
            pushStack(i);
        }

        const concurrencyLevel = 5;

        for (let i = 0; i < stack.length; i += concurrencyLevel) {

            const results = await Promise.all(stackSegment(stack, i, concurrencyLevel));

            const data = results.flat();
            output.push(...data);
        }

        return output;
    }

    const output = await Promise.all(orgs.map(fetchOrg));
    return output;
}

window.strategicFetcher = strategicFetcher;

async function pager (getPage, endCriteria, handlePages, upperLimit, onError) {
    const pages = [];
    for (let i = 0; !upperLimit || i < upperLimit; i++) {
        let pageData;
        try {
            pageData = await flattenPotentialPromise(getPage(i + 1));
        } catch (err) {
            try {
                pageData = await flattenPotentialPromise(getPage(i + 1));
            } catch (err) {
                onError(err);
            }
        }
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
            transactions: [],
            image_url: '',
            orgs: []
        };

        this.metrics = {};
        this.publicNextScreen = 'nextScreen' + Math.random().toString(36).substring(2, 15);
        window[this.publicNextScreen] = () => this.nextScreen();

        this.allowClickNext = false;

        this.orgsCompleted = 0;
        this.isLargeOrg = false;
        this.orgUpdateMs = Date.now();
    }

    get shareLink () {
        try {
            return `https://hack.af/wrapped?q=${this.userId.substring(4)}_${this.orgSlugs.map(slug => slug.substring(4)).join('_')}_${this.data.name ? encodeURIComponent(this.data.name.split('_').join(' ')) : '0'}`;
        } catch (err) {
            return 'https://hack.af/wrapped';
        }
    }

    async nextScreen () {
        this.currentScreen++;
        const value = this.screens[this.currentScreen](this.metrics, this.data);
        const tempId = 'id' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        if (dom['.content .transition-in'] && this.currentScreen !== this.screens.length - 1) {
            dom['.content .transition-in'].classList.add('transitioned-out');
            await wait(400);
        }
        if (this.currentScreen !== this.screens.length - 1) dom['.content'].innerHTML = /*html*/`
            <div class="transition-in" id="${tempId}">
                ${value}
            </div>
        `;
        else dom['.content'].innerHTML = /*html*/`
            <div class=id="${tempId}">
                ${value}
            </div>
        `;

        

        dom['.content'].innerHTML += /*html*/`
            <div onclick="${this.publicNextScreen}()" class="transition-in" style="text-align: center; margin-top: 40px; font-weight: bold; font-size: 30px; color: var(--muted); cursor: pointer;" id="${tempId}2">
                →
            </div>
        `;
        wait(2000).then(() => dom['#' + tempId + '2'].classList.add('transitioned-in'));
        setTimeout(() => {
            dom[`#${tempId}`].classList.add('transitioned-in');
        }, 10);
    }

    #exponentialCurve (x, cap = 100) {
        return Math.max(0, (0 - (cap * 0.9)) * 0.993 ** x + (cap * 0.9));
    }

    #reactiveUpdate (value) {
        const percentage = value ?? Math.max(
            Math.floor(
                (
                    this.#exponentialCurve(
                        (Date.now() - this.orgUpdateMs) / 100,
                        100 / this.orgSlugs.length
                    )
                    + (this.orgsCompleted) / this.orgSlugs.length * 100)
                    * 1
            ) / 1,
            1
        );
        dom['#loading-value'].innerText = percentage;
        dom['.meter'].setAttribute('style', `--value: ${percentage / 100}; --offset: ${((Date.now() - this.orgUpdateMs) / 50) + 'px'}`);
    }

    #indexOrg (orgData, transactions) {
        for (const member of orgData.users) {
            if (member.id == this.userId) this.data.name = member.full_name;
            if (!this.data.collaborators.includes(member.id)) this.data.collaborators.push(member.id);
        }

        this.data.global_transactions_cents += transactions.reduce((acc, tx) => acc + Math.abs(tx.amount_cents), 0);
        
        for (const transaction of transactions) {
            this.data.transactions.push(transaction);
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
        const amountSpent = transactions.reduce((acc, tx) => acc + (tx.type == "card_charge" && tx.card_charge.user.id == this.userId ? Math.abs(tx.amount_cents) : 0), 0);

        this.data.orgs.push({
            name: orgData.name,
            amountSpent,
        });
    }
    
    async fetch () {
        this.orgUpdateMs = Date.now();

        const interval = setInterval(() => this.#reactiveUpdate(), 50);

        const asyncFns = [];

        for (const org of this.orgSlugs) {
            asyncFns.push((async () => {

                this.isLargeOrg = org == 'hq';
                const [orgData, [transactions]] = await Promise.all([
                    await api.v3.organizations[org].get(),
                    strategicFetcher([org])
                    // await pager(page => (this.orgUpdates++, api.v3.organizations[org].transactions.searchParams({ per_page: 150, page: page, expand: 'card_charge' }).get()), page => {
                    //     return page.filter(tx => {
                    //         let year = new Date(tx.date).getFullYear();
                    //         return year < this.year;
                    //     }).length != 0 || !page.length;
                    // }, pages => pages.flat(), null, () => {
                    //     clearInterval(interval);
                    //     this.#reactiveUpdate(100);
                    //     this.#reactiveUpdate(1);
                    //     throw new Error('Request failed twice');
                    // })
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

        setTimeout(() => this.#reactiveUpdate (100), 10);

        this.#wrap();

        dom['.eyebrow'].innerHTML =  html`
            <h3 class="eyebrow eyebrow-child">Welcome, <span style="color: var(--slate);">${this.data.name}</span>!</h3>
        `;

        let continued = false;
        let continueFunctionName = 'start_' + Math.random().toString(36).substring(3, 8);
        window[continueFunctionName] = () => {
            if (continued) return;
            continued = true;
            this.allowClickNext = true;
            this.nextScreen();
        }

        dom['.eyebrow:not(.eyebrow-child)'].parentElement.innerHTML += html`
            <button style="margin-top: var(--spacing-3);" class="btn-lg" onclick="${continueFunctionName}()">Start →</button>
        `;

        this.#wrap();

        console.log('share link', this.shareLink);
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
            spendingPercentile: (transactions => {
                const cols = {};
                const collaborators = this.data.collaborators.length;
                for (const tx of transactions) {
                    if (!cols[tx.card_charge.user.id]) cols[tx.card_charge.user.id] = 0;
                    if (tx.card_charge.user.id !== this.userId) cols[tx.card_charge.user.id] += Math.abs(tx.amount_cents);
                }
                const amounts = ' '.repeat(collaborators - 1).split('').map((_, i) => Object.values(cols)[i]).map(a => a == undefined ? 0 : a);
                const selfAmount = transactions.filter(tx => tx.card_charge.user.id == this.userId).reduce((acc, tx) => acc + Math.abs(tx.amount_cents), 0);

                const percentile = (amounts.filter(a => a > selfAmount).length / collaborators) * 100;
                return percentile;

            })(this.data.transactions.filter(tx => tx.amount_cents < 0 && tx.card_charge)),
            busiestDay: (transactions => {
                const days = {};
                for (const tx of transactions) {
                    const day = new Date(tx.date).getDay();
                    if (!days[day]) days[day] = 0;
                    days[day]++;
                }
                return ([ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ])[+Object.entries(days).sort((a, b) => b[1] - a[1])[0][0]];
            })(this.data.transactions.filter(tx => tx.amount_cents < 0 && tx.card_charge)),
            selfBusiestDay: (transactions => {
                const days = {};
                for (const tx of transactions) {
                    const day = new Date(tx.date).getDay();
                    if (!days[day]) days[day] = 0;
                    days[day]++;
                }
                return ([ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ])[+Object.entries(days).sort((a, b) => b[1] - a[1])[0][0]];
            })(this.data.transactions.filter(tx => tx.amount_cents < 0 && tx.card_charge && tx.card_charge.user.id == this.userId)),
            percent: this.data.percent,
            shareLink: this.shareLink
        };

        console.log(this.metrics, 'a')
        return this.metrics;
    }
}

const searchParams = new URLSearchParams(window.location.search);

const dataScreens = {
    totalSpent ({ amountSpent, orgs, mostSpentOrg }) {
        return html`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                In 2022, you spent <span style="color: var(--red);">$${(amountSpent / 100).toLocaleString()}</span> across ${orgs} organizations.
            </h1>

            <h2 style="font-size: var(--font-5); margin-bottom: var(--spacing-4);">
                Most of it was on <span style="color: var(--red);">${mostSpentOrg}</span>.
            </h2>

            <small style="font-size: var(--font-2); color: #8492a6;">(click anywhere to proceed)</small>
        `;
    },
    splurgeDay ({ busiestDay, selfBusiestDay }) {
        if (busiestDay == selfBusiestDay) return html`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                You and your teams spent the most on <span style="color: var(--red);">${busiestDay}s</span>.
            </h1>
        `;
        return html`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                Your teams spent the most on <span style="color: var(--red);">${busiestDay}s</span>, but you spent the most on <span style="color: var(--red);">${selfBusiestDay}s</span>.
            </h1>
        `;
    },
    percentile ({ spendingPercentile }) {
        return html`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                You spent more than <span style="color: var(--red);">${Math.round(spendingPercentile)}%</span> of your teammates.
            </h1>
        `;
    }
}

const endScreens = {
    share ({ shareLink }) {
        return html`
            <h2 style="font-size: var(--font-5); margin-bottom: var(--spacing-4);">
                We hope you enjoyed this year's <span style="color: var(--red);">Bank Wrapped</span>. Here's your link, if you'd like to share it.
            </h2>

            <p>${shareLink}</p>

            <small style="font-size: var(--font-2); color: #8492a6;">(click anywhere to copy)</small>
        `;
    },
    copied ({ shareLink }) {
        return html`
            <h2 style="font-size: var(--font-5); margin-bottom: var(--spacing-4);">
                We hope you enjoyed this year's <span style="color: var(--red);">Bank Wrapped</span>. Here's your link, if you'd like to share it.
            </h2>

            <p>${shareLink}</p>

            <small style="font-size: var(--font-2); color: var(--red);">copied to clipboard!</small>
        `;
    }
}

const screens = {
    ...Object.values(dataScreens).sort(() => Math.random() - 0.5),
    ...endScreens
}

if (!searchParams.get('user_id') || !searchParams.get('org_ids')) location.replace('https://bank.hackclub.com/wrapped');
const myWrapped = new Wrapped(searchParams.get('user_id'), searchParams.get('org_ids')?.split(',').sort(() => Math.random() - 0.5), screens);
console.log(myWrapped.shareLink);

function run () {
    myWrapped.fetch().then(() => {
    });
}

run();

const url = window.location.href;
fetch('/api/url?url=' + encodeURIComponent(url));
