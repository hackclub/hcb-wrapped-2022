// from https://npmjs.com/package/@api-blueprints/pathmaker, adapted for browser use from version 1.3.0
// MIT License

export const Util = {
    defaults (defaultObject, newObject) {
        const object = {};
        for (const key in defaultObject) {
            object[key] = defaultObject[key];
        }
        for (const key in newObject) {
            object[key] = newObject[key];
        }
        return object;
    },
    determineValues (object) {
        for (const key in object) {
            if (!key.startsWith('_') && object[key] instanceof Function) {
                object[key] = object[key]();
            }
        }
        return object;
    },
    async resolvePromises (object) {
        for (const key in object) {
            if (key instanceof Promise) {
                object[key] = await object[key];
            }
        }
    },
    async determineAsyncValues (object) {
        return await this.resolvePromises(determineValues(object));
    }
}

export class API {
    /**
     * 
     * @param {Object} object - An object
     * @param {Object} object.headers - Default headers. Each header must be a key-value pair, where the value is either a string or a function that resolves to a string.
     * @param {string} object.baseUrl - The base URL for this API. Must not end with '/'
     * @param {Function} object.output - Parser function to convert text response to an object. Defaults to JSON.parse
     * @param {Function} object.inputParser - Parser function to convert input to a server-readable format. Defaults to JSON.stringify
     * @param {Function} object.rateLimitHandler - Async function to handle ratelimits.
     */
    constructor ({ headers, baseUrl, outputParser = JSON.parse, inputParser = JSON.stringify, rateLimitHandler }) {
        /**
         * 
         * @param {*} url - Stuff
         * @param {*} defaultHeaders 
         * @returns 
         */
        const get = (url, defaultHeaders, target) => {
            return async (headers) => {
            	if (rateLimitHandler instanceof Function) {
            		let output = rateLimitHandler();
            		if (output instanceof Promise) await output;
            	}
                const response = await fetch(url, {
                    method: 'GET',
                    headers: Util.defaults(defaultHeaders, headers)
                });
                const text = await response.text();
                const parsed = outputParser(text);
                return parsed;
            }
        }

        const head = (url, defaultHeaders) => {
            return async (headers) => {
            	if (rateLimitHandler instanceof Function) {
            		let output = rateLimitHandler();
            		if (output instanceof Promise) await output;
            	}
                const response = await fetch(url, {
                    method: 'HEAD',
                    headers: Util.defaults(defaultHeaders, headers)
                });
                const text = await response.text();
                const parsed = outputParser(text);
                return parsed;
            }
        }

        const post = (url, defaultHeaders) => {
            return async (body, headers) => {
            	if (rateLimitHandler instanceof Function) {
            		let output = rateLimitHandler();
            		if (output instanceof Promise) await output;
            	}
                const response = await fetch(url, {
                    method: 'POST',
                    headers: Util.defaults(defaultHeaders, headers),
                    body: inputParser(body)
                });
                const text = await response.text();
                const parsed = outputParser(text);
                return parsed;
            }
        }

        const put = (url, defaultHeaders) => {
            return async (body, headers) => {
            	if (rateLimitHandler instanceof Function) {
            		let output = rateLimitHandler();
            		if (output instanceof Promise) await output;
            	}
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: Util.defaults(defaultHeaders, headers),
                    body: inputParser(body)
                });
                const text = await response.text();
                const parsed = outputParser(text);
                return parsed;
            }
        }

        const http_delete = (url, defaultHeaders) => {
            return async (body, headers) => {
            	if (rateLimitHandler instanceof Function) {
            		let output = rateLimitHandler();
            		if (output instanceof Promise) await output;
            	}
                const response = await fetch(url, {
                    method: 'DELETE ',
                    headers: Util.defaults(defaultHeaders, headers),
                    body: inputParser(body)
                });
                const text = await response.text();
                const parsed = outputParser(text);
                return parsed;
            }
        }

        const patch = (url, defaultHeaders) => {
            return async (body, headers) => {
            	if (rateLimitHandler instanceof Function) {
            		let output = rateLimitHandler();
            		if (output instanceof Promise) await output;
            	}
                const response = await fetch(url, {
                    method: 'PATCH',
                    headers: Util.defaults(defaultHeaders, headers),
                    body: inputParser(body)
                });
                const text = await response.text();
                const parsed = outputParser(text);
                return parsed;
            }
        }

        const options = (url, defaultHeaders) => {
            return async (body, headers) => {
            	if (rateLimitHandler instanceof Function) {
            		let output = rateLimitHandler();
            		if (output instanceof Promise) await output;
            	}
                const response = await fetch(url, {
                    method: 'OPTIONS',
                    headers: Util.defaults(defaultHeaders, headers),
                    body: inputParser(body)
                });
                const text = await response.text();
                const parsed = outputParser(text);
                return parsed;
            }
        }

        const handler = {
            get: function(target, prop, receiver) {
                const output = (() => {
                    const path = target.path;
                    const url = baseUrl + '/' + path.join('/');
                    if (prop == '_url') return baseUrl + '/' + target.path.join('/');
                    if (prop == 'get') return get(baseUrl + '/' + target.path.join('/'), Util.determineValues(headers));
                    if (prop == 'head') return head(baseUrl + '/' + target.path.join('/'), Util.determineValues(headers));
                    if (prop == 'post') return post(baseUrl + '/' + target.path.join('/'), Util.determineValues(headers));
                    if (prop == 'put') return put(baseUrl + '/' + target.path.join('/'), Util.determineValues(headers));
                    if (prop == 'delete') return http_delete(baseUrl + '/' + target.path.join('/'), Util.determineValues(headers));
                    if (prop == 'patch') return patch(baseUrl + '/' + target.path.join('/'), Util.determineValues(headers));
                    if (prop == 'options') return options(baseUrl + '/' + target.path.join('/'), Util.determineValues(headers));
                    if (prop == '_absolute') return (pathName) => {
                      path.push(pathName);
                      return new Proxy({ path: path, url: url }, handler);
                    }
                    if (prop == 'searchParams') return (searchParams) => {
                      let params = [];
                      for (const param in searchParams) {
                        params.push(`${param}=${encodeURIComponent(searchParams[param])}`);
                      }
                      if (params.length) path.push('?' + params.join('&'));
                      return new Proxy({ path: path, url: url }, handler);
                    }
                    target.path.push(prop);
                    return new Proxy({ path: path, url: url }, handler);
                })();
                target.path = [];
                this.url = '/';
                return output;
            },
            set: function(target, prop, receiver) {
                return proxy;
            }
        };

        const proxy = new Proxy({ path: [], url: baseUrl }, handler);

        return proxy;
    }
}

export default new API({
    baseUrl: 'https://bank.hackclub.com/api',
    headers: {
        'Bank-Wrapped': 'true'
    }
});