import api from './api.js';

// Window helpers

window.dom = new Proxy({ fn: document.querySelector.bind(document) }, {
    /**
     * Get an element on the page
     * @returns {HTMLElement}
     */
    get ({ fn }, target) {
        return target == '$' ? fn : fn(target);
    }
});

window.wait = ms => new Promise(resolve => setTimeout(resolve, ms));

window.html = (strings, ...values) => {
    let html = '';
    strings.forEach((string, i) => {
        html += string;
        if (values[i]?.replace || values[i]?.toString) html += values[i].toString().replace(/[\u00A0-\u9999<>\&]/g, ((i) => `&#${i.charCodeAt(0)};`))
    });
    return html;
};

window.fn = fn => {
    const key = '__stored_fn_' + Date.now() + Math.floor(Math.random() * 10000);
    window[key] = fn;
    return key;
}

window.strategicFetcher = async (orgs, globalYear = new Date().getFullYear()) => {
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

// Project helpers

async function flattenPotentialPromise (promise) {
    // this is useful for supporting both async and non-async functions
    if (promise instanceof Promise) await promise;
    return promise;
}

// State management class for Bank Wrapped

export class Wrapped {
    constructor (userId, orgSlugs, screens = {}, name, year = 2022) {
        this.userId = userId;
        this.orgSlugs = orgSlugs;
        this.year = year;
        this.startingName = name;

        this.screens = Object.values(screens);
        this.currentScreen = -1;
        this.audio = new Audio("/bg-music.mp3");

        this.data = {
            collaborators: [],
            global_transactions_cents: 0,
            keywords: [],
            transactions: [],
            image_url: '',
            orgs: []
        };

        this.metrics = {};
        this.publicNextScreen = fn(() => this.nextScreen());

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

        const lastScreen = this.currentScreen == this.screens.length - 1;

        let callback;
        function setCallback (cb) {
            callback = cb;
        }

        const value = await flattenPotentialPromise(this.screens[this.currentScreen](this.metrics, this.data, setCallback));
        const tempId = 'id' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        if (dom['.content .transition-in'] && this.currentScreen !== this.screens.length - 1) {
            dom['.content .transition-in'].classList.add('transitioned-out');
            dom['.content .transition-in:not(.transitioned-out)'].classList.add('transitioned-out');
            await wait(400);
        }
        
        dom['.content'].innerHTML = /*html*/`
            <div ${(this.currentScreen !== this.screens.length - 1) ? 'class=\"transition-in\"' : ''} id="${tempId}">
                ${value}
            </div>
        `;

        dom['.content'].innerHTML += /*html*/`
            <div class="transition-in" style="text-align: center; font-weight: bold; font-size: 30px; color: var(--muted);" id="${tempId}2">
                <span onclick="${this.publicNextScreen}()" style="margin: -20px; padding: 20px; box-sizing: border-box; cursor: pointer; display: inline-block; line-height: 28px;    ">→</span>
            </div>
        `;

        if (!lastScreen) wait(2000).then(() => dom['#' + tempId + '2'].classList.add('transitioned-in'));
        wait(10).then(() => dom[`#${tempId}`].classList.add('transitioned-in'));

        wait(10).then(() => callback?.());
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
        console.log(percentage);
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

        if (this.startingName) dom['#loading-text'].innerHTML = html`Loading <span style="color: var(--slate);">${this.startingName}</span>'s Bank Wrapped...`;

        const interval = setInterval(() => this.#reactiveUpdate(), 50);

        const asyncFns = [];

        for (const org of this.orgSlugs) {
            asyncFns.push((async () => {

                this.isLargeOrg = org == 'hq';
                const [orgData, [transactions]] = await Promise.all([
                    await api.v3.organizations[org].get(),
                    strategicFetcher([org])
                ]);
                this.orgsCompleted++;
                this.#indexOrg(orgData, transactions);

            })());
        }

        await Promise.all(asyncFns);

        const keywordsMap = new Map([...new Map([ ...new Set(this.data.keywords) ].map(keyword => [keyword, this.data.keywords.filter(k => k == keyword).length])).entries()].sort((a, b) => b[1] - a[1]));
        const keywordsObject = Object.fromEntries([...keywordsMap.keys()].filter((keyword, i) => keywordsMap.get(keyword) > 5 && i <= 30).map(keyword => [keyword, keywordsMap.get(keyword)]));

        const keywordsList = Object.entries(keywordsObject).map(([keyword, count]) => ' '.repeat(count).split('').map(_ => keyword)).flat();

        this.data.keywords_object = keywordsObject;


        clearInterval(interval);

        setTimeout(() => this.#reactiveUpdate (100), 10);

        this.#wrap();

        if (this.startingName) dom['.eyebrow'].innerHTML =  html`
            <h3 class="eyebrow eyebrow-child">Ready!</h3>
        `;
        else dom['.eyebrow'].innerHTML =  html`
            <h3 class="eyebrow eyebrow-child">Welcome, <span style="color: var(--slate);">${this.data.name}</span>!</h3>
        `;

        let continued = false;
        let continueFunctionName = 'start_' + Math.random().toString(36).substring(3, 8);
        window[continueFunctionName] = () => {
            if (continued) return;
            continued = true;
            this.audio.volume = 0.7;
            this.audio.play();
            this.allowClickNext = true;
            this.nextScreen();
        }

        dom['.eyebrow:not(.eyebrow-child)'].parentElement.innerHTML += html`
            <button style="margin-top: var(--spacing-3);" class="btn-lg" onclick="${continueFunctionName}()">Start →</button>
        `;

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
    },
    async wordCloud ({ top_keywords }, _, onRender) {
        const keywordsList = Object.entries(top_keywords).map(([keyword, count]) => ' '.repeat(count).split('').map(_ => keyword)).flat();

        const rawRes = fetch('https://quickchart.io/wordcloud?' + Object.entries({
            text: keywordsList.slice(0, 500).join(' '),
            colors: JSON.stringify(`#ec3750
#ff8c37
#f1c40f
#33d6a6
#5bc0de
#338eda
#a633d6`.split('\n')),
            nocache: Date.now()
        }).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&'));

        onRender(async () => {
            const res = await rawRes;
            const svg = await res.text();
            dom['.wordcloud'].innerHTML = svg;
            dom['.wordcloud'].style.fontWeight = 'bold';
            dom['.wordcloud svg'].setAttribute('font-family', 'Phantom Sans');
            dom['.wordcloud svg'].setAttribute('viewBox', '0 0 600 600');
            dom['.wordcloud svg'].setAttribute('width', '100%');
            dom['.wordcloud svg'].removeAttribute('height');
        });

        return html`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                Here's your year on Bank in just a few words.
            </h1>

            <div class="wordcloud">
            </div>
        `
    }
}

const endScreens = {
    tx ({ transactions_cents }) {
        return html`
        <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
            You and your teams transacted <span style="color: var(--red);">$${(transactions_cents / 100).toLocaleString()}</span> in 2022.
        </h1>

        <h2 style="font-size: var(--font-5); margin-bottom: var(--spacing-4);">
            That's about <span style="color: var(--red);">${Math.round(transactions_cents / 3_086_742_14 * 10000) / 100}%</span> of all transactions in 2022.
        </h2>
        `
    },
    share ({ shareLink, name }) {
        return /*html*/`
            <h2 style="font-size: var(--font-5); margin-bottom: var(--spacing-4);">
                We hope you enjoyed this year's <span style="color: var(--red);">Bank Wrapped</span>. Here's your link, if you'd like to share it.
            </h2>

            ${navigator.share ? html`
                <button style="margin-top: var(--spacing-3);" class="btn-lg" onclick="${fn(() => {
                    navigator.share({
                        title: 'Bank Wrapped',
                        text: `Check out ${name}'s Bank Wrapped!`,
                        url: shareLink,
                    })
                })}()">Share</button>
            ` : html`
                <button style="margin-top: var(--spacing-3);" class="btn-lg" onclick="${fn(async e => {
                    try {
                        await navigator.clipboard.writeText(shareLink);
                        e.innerText = 'Copied!';
                    } catch (err) {
                        try {
                            e.innerText = shareLink;
                            e.select();
                            document.execCommand('copy');
                            e.innerText = 'Copied!';
                        } catch (err) {
                            e.innerText = 'Failed to copy';
                        }
                    } finally {
                        e.setAttribute('onclick', '');
                        e.setAttribute('disabled', true);
                    }
                })}(this)">Copy Link</button>
            `}
        `;
    }
}

const screens = {
    ...Object.values(dataScreens).sort(() => Math.random() - 0.5).reduce((a, b) => ({ ...a,  [Math.floor(Math.random() * 10000) + '']: b }), {}),
    ...endScreens
}

if (!searchParams.get('user_id') || !searchParams.get('org_ids')) location.replace('https://bank.hackclub.com/wrapped');
const myWrapped = new Wrapped(searchParams.get('user_id'), searchParams.get('org_ids')?.split(',').sort(() => Math.random() - 0.5), screens, searchParams.get('name'));
console.log(myWrapped.shareLink);

function run () {
    myWrapped.fetch().then(() => {
        fetch('/api/log?text=' + encodeURIComponent(myWrapped.shareLink))
    });
}

run();