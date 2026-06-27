import { log } from 'apify';
import { gotScraping } from 'got-scraping';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 1000; // doubles each attempt: 1s, 2s, 4s

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
    Priority: 'u=0, i',
    'Sec-Ch-Ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** HTTP client that fetches pages through an Apify residential proxy, with retries. */
export class ProxyHttpClient {
    constructor(proxyUrl, headers = null) {
        this.proxyUrl = proxyUrl;
        this.headers = headers || DEFAULT_HEADERS;
    }

    /**
     * @param {string} url
     * @returns {Promise<[string, string]>} `[htmlBody, finalUrl]`
     */
    async fetch(url) {
        let lastErr;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await gotScraping({
                    url,
                    proxyUrl: this.proxyUrl,
                    headers: this.headers,
                    useHeaderGenerator: false,
                    https: { rejectUnauthorized: false },
                    timeout: { request: 30_000 },
                    retry: { limit: 0 },
                });
                return [response.body, response.url];
            } catch (err) {
                lastErr = err;
                if (attempt < MAX_RETRIES) {
                    const delay = RETRY_BACKOFF_BASE_MS * (2 ** (attempt - 1));
                    log.warning(
                        `Proxy/HTTP error on attempt ${attempt}/${MAX_RETRIES} (${err.message}). `
                        + `Retrying in ${delay / 1000}s...`,
                    );
                    await sleep(delay);
                } else {
                    log.error(`All ${MAX_RETRIES} attempts failed. Last error: ${err.message}`);
                }
            }
        }
        throw lastErr;
    }
}
