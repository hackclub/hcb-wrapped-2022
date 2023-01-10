import api from '/assets/api.js';

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

function plural (number, singular, plural) {
    return number == 1 ? singular : plural;
}

// Money incrementer component

class MoneyComponent {
    constructor (amount, startDelay = 10, showCents = true, startAutomatically = true, time = 750, interval = 40, onEnd) {
        this.elementId = 'money-component-' + Math.random().toString(16).substring(4, 10);
        
        this.amount = amount;
        this.showCents = showCents;
        this.time = time;
        this.interval = interval;
        this.isNotMoney = false;
        
        if (onEnd) this.onEnd = onEnd;
        
        if (startAutomatically) {
            this.loadingIntervalId = setInterval(() => {
                const element = document.querySelector('#' + this.elementId);
                
                if (!element || !this.loadingIntervalId) return;
                clearInterval(this.loadingIntervalId);
                this.loadingIntervalId = null;
                
                if (startDelay) wait(startDelay).then(() => this.start());
                else this.start();
            }, 20);
        }
    }
    
    toString () {
        return /*html*/`
            <span id="${this.elementId}">
                $0
            </span>
        `;
    }
    
    tick (time) {
        const percent = time / this.time;
        return this.amount * (1 - 0.98 ** (percent * 200));
    }
    
    start () {
        this.startTime = Date.now();
        this.element = document.getElementById(this.elementId);
        
        if (!this.element) throw new Error('Could not fetch critical element with ID ' + this.elementId)
        
        this.runningIntervalId = setInterval(() => {
            const timeElapsed = Date.now() - this.startTime;
            const ended = timeElapsed > this.time;
            
            if (ended) {
                this.setValue(this.amount);
                clearInterval(this.runningIntervalId);
                this.runningIntervalId = null;
                return this.onEnd?.(true);
            }
            
            const value = this.tick(timeElapsed);
            this.setValue(value);
        }, this.interval);
    }
    
    setValue (value) {
        if (this.isNotMoney) return this.element.innerText = Math.round(value);
        this.element.innerText = ((this.showCents ? (Math.round(value * 100) / 100) : Math.round(value))?.toLocaleString?.("en", {
            style: "currency",
            currency: "USD",
            ...(this.showCents ? { minimumFractionDigits: 2,
                maximumFractionDigits: 2 } : {}),
        }) ?? +value);
    }
        
    stop () {
        clearInterval(this.runningIntervalId);
        this.runningIntervalId = null;
        this.setValue(this.amount);
        return this.onEnd?.(false);
    }

    notMoney () {
        this.isNotMoney = true;
        this.showCents = false;
        return this.toString();
    }
}

// State management class for Bank Wrapped

export class Wrapped {
    constructor (userId, orgSlugs, screens = {}, name, year = 2022) {
        this.userId = userId;
        this.orgSlugs = orgSlugs;
        this.year = year;
        this.startingName = name;

        this.screens = Object.values(screens).filter(screen => screen);
        this.currentScreen = -1;
        this.audio = new Audio("/assets/bg-music.mp3");

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
            return `https://hack.af/wrapped?q=${this.userId.substring(4)}_${this.orgSlugs.map(slug => slug.substring(4)).join('_')}_${this.data.name ? encodeURIComponent(this.data.name.split('_').join(' ').split(' ')[0]) : '0'}`;
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
            <div ${true ? 'class=\"transition-in\"' : ''} id="${tempId}">
                ${value}
            </div>
        `;

        if (!lastScreen) dom['.content'].innerHTML += /*html*/`
            <div class="transition-in" style="text-align: center; font-weight: bold; font-size: 30px; color: var(--muted);" id="${tempId}2">
                <span onclick="${this.publicNextScreen}()" style="margin: -20px; padding: 20px; box-sizing: border-box; cursor: pointer; display: inline-block; line-height: 28px;    ">→</span>
            </div>
        `;

        wait(2000).then(() => dom['#' + tempId + '2'].classList.add('transitioned-in'));
        wait(10).then(() => dom[`#${tempId}`].classList.add('transitioned-in'));

        wait(10).then(() => callback?.());
    }

    #exponentialCurve (x, cap = 100) {
        return Math.max(0, (0 - (cap * 0.9)) * 0.993 ** x + (cap * 0.9));
    }

    #reactiveUpdate (value) {
        const percentage = this.percentageValue ?? value ?? Math.max(
            Math.floor(
                (
                    this.#exponentialCurve(
                        (Date.now() - this.orgUpdateMs) / 97,
                        100 / this.orgSlugs.length
                    )
                    + (this.orgsCompleted) / this.orgSlugs.length * 97)
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
            slug: orgData.slug,
            logo: orgData.logo,
            id: orgData.id,
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

        this.percentageValue = 97;

        const res = await fetch('https://quickchart.io/wordcloud?' + Object.entries({
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

        this.metrics.wordcloudSvg = await res.text();


        this.data.keywords_object = keywordsObject;

        clearInterval(interval);
        this.percentageValue = 100;
        setTimeout(() => this.#reactiveUpdate(100), 20);

        this.#wrap();

        if (this.startingName) dom['.eyebrow'].innerHTML =  html`
            <h3 class="eyebrow eyebrow-child">Ready!</h3>
        `;
        else dom['.eyebrow'].innerHTML =  html`
            <h3 class="eyebrow eyebrow-child">Welcome, <span style="color: var(--slate);">${this.data.name.split(' ')[0]}</span>!</h3>
        `;

        let continued = false;
        let continueFunctionName = 'start_' + Math.random().toString(36).substring(3, 8);
        window[continueFunctionName] = () => {
            if (continued) return;
            continued = true;
            this.audio.volume = 0.4;
            this.audio.play();
            this.allowClickNext = true;
            this.nextScreen();
        }

        dom['.eyebrow:not(.eyebrow-child)'].parentElement.innerHTML += html`
            <button style="margin-top: var(--spacing-3);" class="button" onclick="${continueFunctionName}()">Start →</button>
        `;

        console.debug('share link', this.shareLink);
    }

    #wrap () {
        this.metrics = {
            collaborators: this.data.collaborators.length,
            orgs: this.data.orgs.length,
            amountSpent: this.data.orgs.reduce((acc, org) => acc + org.amountSpent, 0),
            mostSpentOrg: this.data.orgs.sort((a, b) => b.amountSpent - a.amountSpent)[0].name,
            mostSpentOrgSlug: this.data.orgs.sort((a, b) => b.amountSpent - a.amountSpent)[0].slug,
            allOrgs: this.data.orgs,
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
            busiestMonth: (transactions => {
                const months = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];
                const occurances = {};
                transactions.forEach(tx => {
                    const month = months[+tx.date.split('-')[1] - 1];
                    if (!occurances[month]) occurances[month] = 0;
                    occurances[month] += Math.abs(tx.amount_cents);
                });
                let busiestMonth = '';
                let busiestAmount = 0;
                for (const month in occurances) {
                    if (occurances[month] > busiestAmount) {
                        busiestMonth = month;
                        busiestAmount = occurances[month];
                    }
                }
                return { name: busiestMonth, amount: busiestAmount };
            })(this.data.transactions.filter(tx => tx.amount_cents < 0)),
            percent: this.data.percent,
            shareLink: this.shareLink,
            activeDays: this.data.transactions.filter(tx => tx.card_charge?.user?.id == this.userId).map(tx => tx.date).reduce((prev, curr) => {
                if (!prev.includes(curr)) prev.push(curr);
                return prev;
            }, []).length,
            wordcloud: this.metrics.wordcloudSvg,
            transactions: this.data.transactions,
            userId: this.userId,
            nextScreen: this.publicNextScreen
        };

        return this.metrics;
    }
}

const searchParams = new URLSearchParams(window.location.search);

const dataScreens = {
    totalSpent ({ amountSpent, orgs, mostSpentOrg, mostSpentOrgSlug }) {
        return /*html*/`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                In 2022, you spent <span style="color: var(--red);">
                    ${new MoneyComponent(amountSpent/*Cents*/ / 100)}
                </span> across ${orgs} organizations.
            </h1>

            <h2 style="font-size: var(--font-5); margin-bottom: var(--spacing-4);">
                Most of it was on <a href="https://bank.hackclub.com/${mostSpentOrgSlug}" target="_blank" style="color: var(--red);">${html`${mostSpentOrg}`}</a>.
            </h2>

        `;
    },
    splurgeDay ({ busiestDay, selfBusiestDay, orgs }) {
        if (busiestDay == selfBusiestDay) return html`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                You and your ${plural(orgs, 'team', 'teams')} spent the most on <span style="color: var(--red);">${busiestDay}s</span>.
            </h1>
        `;
        return html`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                Your ${plural(orgs, 'team', 'teams')} spent the most on <span style="color: var(--red);">${busiestDay}s</span>, but you spent the most on <span style="color: var(--red);">${selfBusiestDay}s</span>.
            </h1>
        `;
    },
    // percentile ({ spendingPercentile }) {
    //     return html`
    //         <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
    //             You spent more than <span style="color: var(--red);">${Math.round(spendingPercentile)}%</span> of your teammates.
    //         </h1>
    //     `;
    // },
    // activeDays ({ activeDays }) {
    //     return /*html*/`
    //         <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
    //             In 2022, you were active on Bank for <span style="color: var(--red);">
    //                 ${new MoneyComponent(activeDays).notMoney()}
    //             </span> days.
    //         </h1>
    //     `
    // },
    // maybe add streaks in the future
    async wordCloud ({ wordcloud }, _, onRender) {
        onRender(async () => {
            dom['.wordcloud'].innerHTML = wordcloud;
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
    transactionSample: ({ userId, transactions, nextScreen, allOrgs }, _, onRender) => {
        console.log(allOrgs);
        console.log(transactions);
        dom['.content'].width = '100%';
        dom['div.main'].maxWidth = '700px';
        const txns = transactions.filter(tx => tx.amount_cents < 0 && tx.card_charge && tx.card_charge.user.id == userId).length;
        if (txns == 0) onRender(() => window[nextScreen]());
        return /*html*/`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                You made <span style="color: var(--red);">${new MoneyComponent(txns).notMoney()}</span> card ${plural(txns, 'transaction', 'transactions')} in 2022. Here are a few of them.
            </h1>

            <div style="width: 100%;">
                ${transactions.filter(tx => tx.amount_cents < 0 && tx.card_charge && tx.card_charge.user.id == userId).sort(() => Math.random() - 0.5).sort(() => Math.random() - 0.5).slice(0, 4).map(transaction => /*html*/`
                    <a href="https://bank.hackclub.com/hcb/${transaction.id.substring(4)}" target="_blank" style="text-decoration: none!important; color: black!important;"><div style="width: 100%; height: 60px; margin-bottom: var(--spacing-3); background: #ec375020; border-radius: 8px; display: flex; box-sizing: border-box;">
                        <span style="height: 100%; text-align: left; display: block; flex-grow: 1; line-break: anywhere; white-space: nowrap; overflow: hidden; display: block; text-overflow: ellipsis; align-items: center; padding: 14px; font-size: 18px;">${allOrgs.filter(org => org.id == transaction.organization.id)?.[0]?.logo ? /*html*/`<img style="height: 100%; vertical-align: bottom; margin-right: 10px;" src="${allOrgs.filter(org => org.id == transaction.organization.id)?.[0]?.logo}" />` : ''}${html`${transaction.memo}`}</span>
                        <span class="tx-details" style="height: 100%; align-items: center; padding: 14px; font-size: 18px;">${transaction.date}</span>
                        <span class="tx-details" style="height: 100%; align-items: center; padding: 14px; font-size: 18px;">-$${Math.abs(transaction.amount_cents / 100).toLocaleString()}</span>
                    </div></a>
                `).join('')}
            </div>
        `
    },
    month ({ busiestMonth }) {
        dom['.content'].width = 'unset';
        dom['div.main'].maxWidth = '600px';
        return /*html*/`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                Your busiest month in 2022 was <span style="color: var(--red);">${busiestMonth.name}</span>.
            </h1>

            <h2 style="font-size: var(--font-5); margin-bottom: var(--spacing-4);">
                You and your teams spent <span style="color: var(--red);">${new MoneyComponent(busiestMonth.amount/*Cents*/ / 100)}</span>.
            </h2>

            
        `
    },
    tx ({ transactions_cents }) {
        return /*html*/`
            <h1 class="title" style="font-size: 48px; margin-bottom: var(--spacing-4);">
                You and your teams transacted <span style="color: var(--red);">
                
                
                ${new MoneyComponent(transactions_cents / 100)}</span> in 2022.
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
                <button style="margin-top: var(--spacing-3);" class="button" onclick="${fn(() => {
                    navigator.share({
                        title: 'Bank Wrapped',
                        text: `Check out ${name}'s Bank Wrapped!`,
                        url: shareLink,
                    })
                })}()">Share</button>
            ` : html`
                <button style="margin-top: var(--spacing-3);" class="button" onclick="${fn(async e => {
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

            <button style="margin-top: var(--spacing-3); margin-left: 10px; padding: 7px 14px 7px 14px;" class="button outline" onclick="window.location.reload();">Watch Again</button>
        `;
    }
}

const screens = {
    ...Object.values(dataScreens).sort(() => Math.random() - 0.5).reduce((a, b) => ({ ...a,  [Math.floor(Math.random() * 10000) + '']: b }), {}),
    ...endScreens
}

if (!searchParams.get('user_id') || !searchParams.get('org_ids')) location.replace('https://bank.hackclub.com/wrapped');
const myWrapped = new Wrapped(searchParams.get('user_id'), searchParams.get('org_ids')?.split(',').sort(() => Math.random() - 0.5), screens, searchParams.get('name'));
console.debug(myWrapped.shareLink);

function run () {
    myWrapped.fetch().then(() => {
        fetch('/api/log?text=' + encodeURIComponent(myWrapped.shareLink))
    });

    window['activeWrappedInstance'] = myWrapped;
}

run();