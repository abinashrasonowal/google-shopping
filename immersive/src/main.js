import { Actor, log } from 'apify';

import { parseProduct, isBlocked } from './parser.js';
import { ProxyHttpClient } from './proxy_http_client.js';

const OSHOP_BASE_URL = 'https://www.google.com/search';
const GOOGLE_DOMAIN_RE = /(^|\.)(google\.[a-z]{2,}(\.\w{2})?)$/i;
const COUNTRY_CODE_RE = /^[a-z]{2}$/i;

/** Throw an Error with a descriptive message for any invalid input. */
function validateInput(url, country) {
    if (!url || !url.trim()) {
        throw new Error(
            'Input field "url" is required. '
            + 'Provide a Google Shopping product URL containing a prds= query parameter.',
        );
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(
            `"url" does not look like a valid URL: ${JSON.stringify(url)}. `
            + 'Expected a full URL starting with https://www.google.com/...',
        );
    }

    const scheme = parsed.protocol.replace(/:$/, '');
    if (scheme.toLowerCase() !== 'https') {
        throw new Error(
            `"url" must use the https scheme, got ${JSON.stringify(scheme)}. `
            + 'Google Shopping URLs always start with https://',
        );
    }

    if (!GOOGLE_DOMAIN_RE.test(parsed.hostname)) {
        throw new Error(
            '"url" must be a Google domain (e.g. google.com, google.co.in), '
            + `got ${JSON.stringify(parsed.hostname)}.`,
        );
    }

    if (!parsed.searchParams.get('prds')) {
        throw new Error(
            '"url" must contain a prds= query parameter. '
            + 'Open a product in Google Shopping, copy the full URL from the address bar — '
            + 'it should contain prds=eto:... or similar.',
        );
    }

    if (country && !COUNTRY_CODE_RE.test(country)) {
        throw new Error(
            '"country" must be a 2-letter ISO country code (e.g. "in", "us", "gb"), '
            + `got ${JSON.stringify(country)}.`,
        );
    }
}

/** Build the canonical immersive (oshop) URL, injecting the required query params. */
function buildImmersiveUrl(url, country) {
    const parsed = new URL(url);
    const params = parsed.searchParams;

    if (!params.has('ibp')) params.set('ibp', 'oshop');
    if (!params.has('hl')) params.set('hl', 'en');
    if (!params.has('gl')) params.set('gl', country);
    if (!params.has('udm')) params.set('udm', '28');

    return `${OSHOP_BASE_URL}?${params.toString()}`;
}

async function runImmersive(httpClient, url, country) {
    const fetchUrl = buildImmersiveUrl(url, country);
    log.info(`Fetching immersive product URL: ${fetchUrl}`);

    const [html, finalUrl] = await httpClient.fetch(fetchUrl);
    log.info(`Fetched ${html.length} bytes of HTML. Final URL: ${finalUrl.slice(0, 100)}`);

    if (isBlocked(html)) {
        log.warning('Blocked by Google (captcha / unusual traffic)');
        return null;
    }

    const product = parseProduct(html, url, finalUrl);

    log.info(
        `Parsed product blocks: title=${product.title} `
        + `features=${Object.keys(product.features || {}).length} `
        + `buying_options=${(product.buying_options || []).length} `
        + `filters=${(product.filters || []).length}`,
    );

    if (
        Object.keys(product.features || {}).length === 0
        && (product.buying_options || []).length === 0
    ) {
        log.warning(
            'Fetched HTML did not contain Google Shopping immersive product blocks. '
            + 'This usually means Google returned a sparse/static variant for this request.',
        );
        await Actor.setValue('sparse-response.html', html, { contentType: 'text/html' });
    }

    return product;
}

await Actor.init();
try {
    const input = (await Actor.getInput()) || {};
    const url = input.url;
    const country = input.country || 'in';

    validateInput(url, country);

    const proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['RESIDENTIAL'],
        countryCode: country.toUpperCase(),
    });
    const proxyUrl = await proxyConfiguration.newUrl();
    const httpClient = new ProxyHttpClient(proxyUrl);

    const product = await runImmersive(httpClient, url, country);
    if (product) {
        await Actor.pushData(product);
        log.info('Pushed immersive product details to dataset');
    }
} finally {
    await Actor.exit();
}
