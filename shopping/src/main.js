import { Actor, log } from 'apify';

import { runSearch } from './search.js';

await Actor.init();
try {
    const input = (await Actor.getInput()) || {};
    const query = input.query;
    const country = input.country || 'in';

    if (!query) throw new Error('Input field "query" is required');

    log.info(`Searching for "${query}" in ${country}`);
    const { products, html, blocked } = await runSearch(query, country);
    log.info(`Fetched ${html.length} bytes; parsed ${products.length} products`);

    if (blocked) {
        log.warning('Blocked by Google (captcha / unusual traffic)');
    } else if (products.length) {
        await Actor.pushData(products);
        log.info(`Pushed ${products.length} products to dataset`);
    } else {
        // Selectors matched nothing — save the page so we can inspect the real DOM.
        await Actor.setValue('search-page.html', html, { contentType: 'text/html' });
        log.warning('0 products parsed — saved raw HTML to key-value store as "search-page.html"');
    }
} finally {
    await Actor.exit();
}
