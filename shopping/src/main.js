import { Actor, log } from 'apify';

import { parseProducts, isBlocked } from './parser.js';
import { ProxyHttpClient } from './proxy_http_client.js';

const SEARCH_BASE_URL = 'http://www.google.com/search';

function buildSearchUrl(query, country, start = 0) {
    const params = new URLSearchParams({ q: query, tbm: 'shop', hl: 'en', gl: country });
    if (start) params.set('start', String(start));
    return `${SEARCH_BASE_URL}?${params.toString()}`;
}

await Actor.init();
try {
    const input = (await Actor.getInput()) || {};
    const query = input.query;
    const country = input.country || 'in';

    if (!query) throw new Error('Input field "query" is required');

    const proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['GOOGLE_SERP'],
        countryCode: country.toUpperCase(),
    });
    const proxyUrl = await proxyConfiguration.newUrl();
    const httpClient = new ProxyHttpClient(proxyUrl);

    log.info(`Searching for "${query}" in ${country}`);
    const html = await httpClient.fetch(buildSearchUrl(query, country));
    log.info(`Fetched ${html.length} bytes of HTML`);

    if (isBlocked(html)) {
        log.warning('Blocked by Google (captcha / unusual traffic)');
    } else {
        const products = parseProducts(html, query, country);
        log.info(`Parsed ${products.length} products`);
        if (products.length) {
            await Actor.pushData(products);
            log.info(`Pushed ${products.length} products to dataset`);
        }
    }
} finally {
    await Actor.exit();
}
