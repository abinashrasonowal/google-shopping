import * as cheerio from 'cheerio';

const CURRENCY_BY_SYMBOL = {
    '₹': 'INR',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
};

function cleanText(value) {
    if (!value) return null;
    return value.replace(/\s+/g, ' ').trim();
}

function nodeText(el, sep = '') {
    if (!el) return '';
    const parts = [];
    const walk = (node) => {
        for (const child of node.children || []) {
            if (child.type === 'text') {
                const t = child.data.trim();
                if (t) parts.push(t);
            } else if (child.type === 'tag') {
                walk(child);
            }
        }
    };
    walk(el);
    return parts.join(sep);
}

function findByAria($, $scope, pred) {
    return $scope
        .find('[aria-label]')
        .filter((_, e) => pred($(e).attr('aria-label') || ''))
        .first();
}

function extractImageMap(html) {
    const imageMap = {};
    const ldiMatch = html.match(/google\.ldi\s*=\s*(\{.*?\});/s);
    if (ldiMatch) {
        try {
            Object.assign(imageMap, JSON.parse(ldiMatch[1]));
        } catch {
            // ignore malformed payloads
        }
    }
    const scriptPattern = /var\s+_u\s*=\s*'([^']+)'\s*;\s*var\s+_i\s*=\s*'([^']+)'\s*;\s*_setImagesSrc/g;
    let m;
    while ((m = scriptPattern.exec(html)) !== null) {
        const url = m[1].replaceAll('\\x3d', '=').replaceAll('\\x26', '&');
        imageMap[m[2]] = url;
    }
    return imageMap;
}

function extractCurrency(...values) {
    const text = values.filter(Boolean).join(' ');
    for (const [symbol, currency] of Object.entries(CURRENCY_BY_SYMBOL)) {
        if (text.includes(symbol)) return currency;
    }
    const match = text.match(/\b[A-Z]{3}\b/);
    return match ? match[0] : null;
}

function extractCurrentPrice($, cardNode) {
    const $card = $(cardNode);
    const isCurrent = (a) => a.startsWith('Current price:') || a.startsWith('Current price is');

    const $container = $card.find('[data-crcy]').first();
    let $priceEl = $();
    if ($container.length) $priceEl = findByAria($, $container, isCurrent);
    if (!$priceEl.length) $priceEl = findByAria($, $card, isCurrent);

    if (!$priceEl.length && !$container.length) {
        return { price: null, currency: null };
    }

    const price = ($priceEl.length ? nodeText($priceEl.get(0)) : '')
        || ($container.length ? nodeText($container.get(0)) : '')
        || null;
    const priceLabel = $priceEl.length ? $priceEl.attr('aria-label') : null;
    const currency = ($container.length ? $container.attr('data-crcy') : null)
        || extractCurrency(price, priceLabel);

    return { price, currency };
}

function extractOldPrice($, cardNode) {
    const $el = findByAria($, $(cardNode), (a) => (
        a.startsWith('Old price was') || a.startsWith('Maximum retail price:')
    ));
    return $el.length ? (nodeText($el.get(0)) || null) : null;
}

function extractOfferTitle($, cardNode) {
    const el = $(cardNode).find('.rYkzq.y1FcZd').first();
    return el.length ? cleanText(nodeText(el.get(0), ' ')) : null;
}

function extractOfferRating($, cardNode) {
    const el = findByAria($, $(cardNode), (a) => a.startsWith('Rated ') && a.includes(' out of 5'));
    if (!el.length) return null;
    const m = (el.attr('aria-label') || '').match(/Rated\s+([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
}

function extractOfferStatus($, cardNode) {
    const el = $(cardNode).find('.OaQPmf').first();
    return el.length ? cleanText(nodeText(el.get(0), ' ')) : null;
}

function extractOfferDelivery($, cardNode) {
    const el = findByAria($, $(cardNode), (a) => a.toLowerCase().includes('delivery'));
    if (!el.length) return null;
    return cleanText(el.attr('aria-label')) || cleanText(nodeText(el.get(0), ' '));
}

function extractSellers($, imageMap) {
    const sellers = [];
    const seen = new Set();

    const offersGrid = $('[data-attrid="organic_offers_grid"]').first();
    const $merchants = offersGrid.length
        ? offersGrid.find('[data-merchant-name]')
        : $('[data-merchant-name]');

    $merchants.each((_, el) => {
        const $el = $(el);
        let $card = $el.closest('[role="listitem"]');
        if (!$card.length) $card = $el.parent();
        if (!$card.length) $card = $el;
        const cardNode = $card.first().get(0);

        const linkEl = $(cardNode).find('a[href]').first();
        const price = extractCurrentPrice($, cardNode);

        let sellerLogo = null;
        const imgTag = $(cardNode).find('img').first();
        if (imgTag.length) {
            const imgId = imgTag.attr('id');
            if (imgId && imageMap[imgId]?.startsWith('http')) {
                sellerLogo = imageMap[imgId];
            } else {
                const src = imgTag.attr('src') || imgTag.attr('data-src') || '';
                if (src.startsWith('http') && !src.includes('data:image')) sellerLogo = src;
            }
        }

        const seller = {
            merchant: $el.attr('data-merchant-name') ?? null,
            merchant_id: $el.attr('data-merchantid') ?? null,
            offer_id: $el.attr('data-oid') ?? null,
            title: extractOfferTitle($, cardNode),
            price: price.price,
            currency: price.currency,
            old_price: extractOldPrice($, cardNode),
            target_url: $el.attr('data-target-url') || (linkEl.length ? linkEl.attr('href') : null),
            status: extractOfferStatus($, cardNode),
            delivery: extractOfferDelivery($, cardNode),
            offer_rating: extractOfferRating($, cardNode),
            seller_logo: sellerLogo,
        };

        const key = `${seller.merchant} ${seller.merchant_id} ${seller.offer_id}`;
        if (!seen.has(key)) {
            sellers.push(seller);
            seen.add(key);
        }
    });

    return sellers;
}

/**
 * Parse a Google Shopping immersive product page into title + buying options.
 * (Trimmed to the fields the resolution engine needs.)
 */
export function parseProduct(html, url, finalUrl) {
    const $ = cheerio.load(html);
    const imageMap = extractImageMap(html);
    const titleEl = $('[data-attrid="product_title"]').first();
    const title = titleEl.length
        ? nodeText(titleEl.get(0))
        : ($('title').first().text().trim() || null);

    return {
        immersive_url: url,
        final_url: finalUrl,
        title,
        buying_options: extractSellers($, imageMap),
    };
}

/** Detect Google block / CAPTCHA pages. */
export function isBlocked(html) {
    const text = cheerio.load(html).text().toLowerCase();
    return ['before you continue', 'unusual traffic', "verify you're human", 'g-recaptcha']
        .some((s) => text.includes(s));
}
