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
        // Save the block page for inspection and fail the run so callers can
        // tell "blocked" apart from a genuine empty result.
        await Actor.setValue('blocked-page.html', html, { contentType: 'text/html' });
        await Actor.fail('Blocked by Google (captcha / unusual traffic) — saved HTML as "blocked-page.html"');
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
