import * as cheerio from 'cheerio';

const OSHOP_BASE_URL = 'https://www.google.com/search';
const SEARCH_BASE_URL = 'http://www.google.com/search';

/** Build the `tbm=shop` search-results URL for a query. */
export function buildSearchUrl(query, country, start = 0) {
    const params = new URLSearchParams({ q: query, tbm: 'shop', hl: 'en', gl: country });
    if (start) params.set('start', String(start));
    return `${SEARCH_BASE_URL}?${params.toString()}`;
}

function decodeJsString(raw) {
    try {
        return JSON.parse(`"${raw.replace(/\\x([0-9A-Fa-f]{2})/g, '\\u00$1')}"`);
    } catch {
        return '';
    }
}

function extractLdiMap(html) {
    const m = html.match(/google\.ldi\s*=\s*(\{.*?\});/s);
    if (!m) return {};
    try {
        return JSON.parse(m[1]);
    } catch {
        return {};
    }
}

function extractInjectedHtml(html) {
    let injected = '';
    const re = /jsl\.dh\([^,]+,\s*"((?:[^"\\]|\\.)*)"\s*\);/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        injected += decodeJsString(m[1]);
    }
    return cheerio.load(injected);
}

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

    const dimg = $(cardEl).find('img[id^="dimg_"]').first();
    const id = dimg.attr('id');
    if (id && ldiMap[id]?.startsWith('http')) return ldiMap[id];

    return null;
}

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

/** Parse a Google Shopping search-results page into a list of products with immersive URLs. */
export function parseProducts(html, query, country) {
    const $ = cheerio.load(html);
    const ldiMap = extractLdiMap(html);
    const $inj = extractInjectedHtml(html);

    const injectedImages = {};
    $inj('[data-pid], .MUWJ8c, g-inner-card').each((_, card) => {
        const img = findImageInCard($inj, card, ldiMap);
        if (!img) return;
        const pid = $inj(card).attr('data-pid');
        const title = text($inj(card).find('.gkQHve'));
        if (pid) injectedImages[pid] = img;
        if (title) injectedImages[title] = img;
    });

    const products = [];
    $('.Ez5pwe').each((i, cardEl) => {
        const $card = $(cardEl);
        const container = $card.find('[data-cid]').first();
        if (!container.length) return;

        const catalogid = container.attr('data-cid');
        const gpcid = container.attr('data-gid');
        const headlineOfferDocid = container.attr('data-oid');
        const imageDocid = container.attr('data-iid');
        const pid = container.attr('data-pid');
        let rds = container.attr('data-rds');
        if (!rds && gpcid) rds = `PC_${gpcid}|PROD_PC_${gpcid}`;

        let url = 'N/A';
        if (catalogid && gpcid && headlineOfferDocid && imageDocid) {
            url = buildProductUrl(query, country, { headlineOfferDocid, imageDocid, rds, catalogid, gpcid });
        } else if (pid && headlineOfferDocid && imageDocid) {
            url = buildProductUrl(query, country, { headlineOfferDocid, imageDocid, rds, pid });
        }

        const title = text($card.find('.gkQHve'));
        const image = findImageInCard($, cardEl, ldiMap)
            || (pid && injectedImages[pid])
            || (title && injectedImages[title])
            || null;

        products.push({
            position: i + 1,
            title,
            url,
            price: text($card.find('.lmQWe')),
            source: text($card.find('.WJMUdc')),
            image,
        });
    });

    return products;
}
