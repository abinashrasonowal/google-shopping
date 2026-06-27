import { gotScraping } from 'got-scraping';

const DEFAULT_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        + 'AppleWebKit/537.36 (KHTML, like Gecko) '
        + 'Chrome/137.0.0.0 Safari/537.36'
    ),
    Accept: (
        'text/html,application/xhtml+xml,application/xml;q=0.9,'
        + 'image/avif,image/webp,image/apng,*/*;q=0.8'
    ),
    'Accept-Language': 'en-IN,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
};

/** Fetches pages through an Apify proxy. */
export class ProxyHttpClient {
    constructor(proxyUrl, headers = null) {
        this.proxyUrl = proxyUrl;
        this.headers = headers || DEFAULT_HEADERS;
    }

    /** @returns {Promise<string>} the response HTML */
    async fetch(url) {
        const response = await gotScraping({
            url,
            proxyUrl: this.proxyUrl,
            headers: this.headers,
            useHeaderGenerator: false,
            https: { rejectUnauthorized: false },
            timeout: { request: 30_000 },
            retry: { limit: 0 },
        });
        return response.body;
    }
}
