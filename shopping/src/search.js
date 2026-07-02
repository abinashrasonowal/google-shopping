import { Actor } from 'apify';
import * as cheerio from 'cheerio';

import { ProxyHttpClient, isBlocked } from '@gs/client';

import { SELECTORS } from './selectors.js';

const OSHOP_BASE_URL = 'https://www.google.com/search';
// Plain http on purpose: Apify's GOOGLE_SERP proxy only accepts http:// targets
// (the proxy performs the actual fetch). Do not change to https.
const SEARCH_BASE_URL = 'http://www.google.com/search';

/** Build the `tbm=shop` search-results URL for a query. */
export function buildSearchUrl(query, country, start = 0) {
    const params = new URLSearchParams({ q: query, tbm: 'shop', hl: 'en', gl: country });
    if (start) params.set('start', String(start));
    return `${SEARCH_BASE_URL}?${params.toString()}`;
}

/**
 * Run a Google Shopping search end-to-end: fetch via an Apify proxy, detect blocks,
 * and parse the product list. Reusable by both the shopping actor and the resolution engine.
 *
 * @param {object} proxyConfiguration  Apify ProxyConfiguration (e.g. GOOGLE_SERP group)
 * @param {string} query
 * @param {string} country
 * @returns {Promise<{ products: object[], html: string, blocked: boolean }>}
 */
export async function searchProducts(proxyConfiguration, query, country) {
    const httpClient = new ProxyHttpClient(await proxyConfiguration.newUrl());
    const [html] = await httpClient.fetch(buildSearchUrl(query, country));
    if (isBlocked(html)) return { products: [], html, blocked: true };
    return { products: parseProducts(html, query, country), html, blocked: false };
}

/**
 * Create a GOOGLE_SERP proxy configuration and run a search in one call.
 * The convenient entry point used by both the shopping actor and the resolution engine.
 *
 * @param {string} query
 * @param {string} country
 * @returns {Promise<{ products: object[], html: string, blocked: boolean }>}
 */
export async function runSearch(query, country) {
    const proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['GOOGLE_SERP'],
        countryCode: country.toUpperCase(),
    });
    return searchProducts(proxyConfiguration, query, country);
}

/** Decode a JS string literal body (handles \xHH, \uHHHH, \", \\, ...). */
function decodeJsString(raw) {
    try {
        return JSON.parse(`"${raw.replace(/\\x([0-9A-Fa-f]{2})/g, '\\u00$1')}"`);
    } catch {
        return '';
    }
}

/** The `google.ldi` map of image id -> real HTTP URL. */
function extractLdiMap(html) {
    const m = html.match(/google\.ldi\s*=\s*(\{.*?\});/s);
    if (!m) return {};
    try {
        return JSON.parse(m[1]);
    } catch {
        return {};
    }
}

/** Parse the deferred HTML hidden inside jsl.dh() blocks (holds the real product URLs). */
function extractInjectedHtml(html) {
    let injected = '';
    const re = /jsl\.dh\([^,]+,\s*"((?:[^"\\]|\\.)*)"\s*\);/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        injected += decodeJsString(m[1]);
    }
    return cheerio.load(injected);
}

function ratingLabel($card) {
    return $card.find(SELECTORS.rating).first().attr('aria-label') || '';
}

function extractRating($card) {
    const m = ratingLabel($card).match(/Rated\s+([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
}

function extractReviewCount($card) {
    const m = ratingLabel($card).match(/([\d,]+\.?\d*[kKmM]?)\s+(?:user\s+)?reviews?/);
    if (!m) return null;
    const raw = m[1].replace(/,/g, '');
    const suffix = raw.slice(-1).toLowerCase();
    if (suffix === 'k') return Math.trunc(parseFloat(raw.slice(0, -1)) * 1_000);
    if (suffix === 'm') return Math.trunc(parseFloat(raw.slice(0, -1)) * 1_000_000);
    return Math.trunc(parseFloat(raw));
}

/**
 * SerpApi-style second-hand condition ("pre-owned" / "refurbished" / "used").
 * The tag slot next to the price also carries discount tags like
 * "5% off ₹69,900", so only exact condition labels are accepted.
 */
function extractCondition($card) {
    const tags = $card.find(SELECTORS.priceTag);
    for (let i = 0; i < tags.length; i++) {
        const label = tags.eq(i).text().trim().toLowerCase();
        if (label === 'refurbished' || label === 'used') return label;
        if (label === 'pre-owned' || label === 'preowned') return 'pre-owned';
    }
    return null;
}

/** Find a valid product image inside a card: direct src/data-src, else via the ldi map. */
function findImageInCard($, cardEl, ldiMap) {
    let found = null;
    $(cardEl).find('img').each((_, img) => {
        if (found) return;
        for (const url of [$(img).attr('src') || '', $(img).attr('data-src') || '']) {
            if (url.startsWith('http') && url.includes('encrypted-tbn') && !url.includes('favicon')) {
                found = url;
                return;
            }
        }
    });
    if (found) return found;

    const dimg = $(cardEl).find(SELECTORS.deferredImage).first();
    const id = dimg.attr('id');
    if (id && ldiMap[id]?.startsWith('http')) return ldiMap[id];

    return null;
}

/** Build the immersive (oshop) product URL from a card's data-* attributes. */
function buildProductUrl(query, country, { headlineOfferDocid, imageDocid, rds, pid, catalogid, gpcid }) {
    const prds = [`headlineOfferDocid:${headlineOfferDocid}`, `imageDocid:${imageDocid}`];
    if (catalogid) prds.push(`catalogid:${catalogid}`, `gpcid:${gpcid}`);
    if (pid) prds.push(`productid:${pid}`, 'pvo:25');
    if (rds) prds.push(`rds:${rds}`);
    prds.push('pvt:hg');

    const params = new URLSearchParams({
        ibp: 'oshop',
        q: query,
        prds: prds.join(','),
        hl: 'en',
        gl: country,
        udm: '28',
    });
    if (pid) params.set('pvorigin', '25');
    return `${OSHOP_BASE_URL}?${params.toString()}`;
}

const text = ($el) => $el.first().text().trim() || null;

/** Parse a Google Shopping search-results page into a list of products. */
export function parseProducts(html, query, country) {
    const $ = cheerio.load(html);
    const ldiMap = extractLdiMap(html);
    const $inj = extractInjectedHtml(html);

    // Fallback image map from the hidden injected HTML (pid / title -> image URL).
    const injectedImages = {};
    $inj(SELECTORS.injectedCard).each((_, card) => {
        const img = findImageInCard($inj, card, ldiMap);
        if (!img) return;
        const pid = $inj(card).attr('data-pid');
        const title = text($inj(card).find(SELECTORS.title));
        if (pid) injectedImages[pid] = img;
        if (title) injectedImages[title] = img;
    });

    const products = [];
    const seen = new Set();
    $(SELECTORS.productCard).each((_, cardEl) => {
        const $card = $(cardEl);
        const container = $card.find(SELECTORS.dataContainer).first();
        if (!container.length) return;

        const catalogid = container.attr('data-cid');
        const gpcid = container.attr('data-gid');
        const headlineOfferDocid = container.attr('data-oid');
        const imageDocid = container.attr('data-iid');
        const pid = container.attr('data-pid');
        let rds = container.attr('data-rds');
        if (!rds && gpcid) rds = `PC_${gpcid}|PROD_PC_${gpcid}`;

        // Skip the same product if it appears in both layouts on one page.
        const key = `${catalogid}|${pid}|${headlineOfferDocid}`;
        if (seen.has(key)) return;
        seen.add(key);

        let url = 'N/A';
        if (catalogid && gpcid && headlineOfferDocid && imageDocid) {
            url = buildProductUrl(query, country, { headlineOfferDocid, imageDocid, rds, catalogid, gpcid });
        } else if (pid && headlineOfferDocid && imageDocid) {
            url = buildProductUrl(query, country, { headlineOfferDocid, imageDocid, rds, pid });
        }

        const title = text($card.find(SELECTORS.title));
        const image = findImageInCard($, cardEl, ldiMap)
            || (pid && injectedImages[pid])
            || (title && injectedImages[title])
            || null;

        products.push({
            position: products.length + 1,
            title,
            url,
            price: text($card.find(SELECTORS.price)),
            second_hand_condition: extractCondition($card),
            rating: extractRating($card),
            review_count: extractReviewCount($card),
            source: text($card.find(SELECTORS.source)),
            image,
        });
    });

    return products;
}
