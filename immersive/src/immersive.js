import * as cheerio from 'cheerio';

import { SELECTORS } from './selectors.js';
import { encodePvf, decodePvf, withSelection, pvfFromUrl } from './pvf.js';

const CURRENCY_BY_SYMBOL = {
    '₹': 'INR',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
};

/** Collapse all whitespace to single spaces and trim. */
function cleanText(value) {
    if (!value) return null;
    return value.replace(/\s+/g, ' ').trim();
}

/**
 * Equivalent of BeautifulSoup's `get_text(separator, strip=True)`:
 * concatenates the stripped text of every descendant text node, joined by `sep`.
 */
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

/** Find the first element preceding `el` in document order matching `selector`. */
function findPrevious($, el, selector) {
    const all = $('*').toArray();
    const idx = all.indexOf(el);
    if (idx < 0) return null;
    for (let i = idx - 1; i >= 0; i--) {
        if ($(all[i]).is(selector)) return all[i];
    }
    return null;
}

/** First element within `$scope` whose aria-label satisfies `pred`. */
function findByAria($, $scope, pred) {
    return $scope
        .find('[aria-label]')
        .filter((_, e) => pred($(e).attr('aria-label') || ''))
        .first();
}

function extractInjectedSoup($) {
    let injectedHtml = '';
    $('script').each((_, script) => {
        const text = $(script).text();
        if (text.includes('jsl.dh(')) {
            injectedHtml += text
                .replaceAll('\\x3c', '<')
                .replaceAll('\\x3e', '>')
                .replaceAll('\\"', '"');
        }
    });
    return cheerio.load(injectedHtml);
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

function isValidProductImage(url) {
    if (!url || !url.startsWith('http')) return false;
    return url.includes('shopping?q=tbn:') || url.includes('encrypted-tbn');
}

function extractMainImage($, imageMap) {
    const metaImg = $(SELECTORS.mainImageMeta).attr('content');
    if (metaImg && isValidProductImage(metaImg)) {
        return metaImg;
    }
    for (const url of Object.values(imageMap)) {
        if (isValidProductImage(url)) return url;
    }
    return null;
}

function extractAllImages($, mainImage) {
    const images = [];

    $(SELECTORS.galleryImage).each((_, el) => {
        const src = $(el).attr('data-src');
        if (isValidProductImage(src) && !images.includes(src)) {
            images.push(src);
        }
    });

    if (mainImage && isValidProductImage(mainImage)) {
        const existing = images.indexOf(mainImage);
        if (existing !== -1) images.splice(existing, 1);
        images.unshift(mainImage);
    }

    return images;
}

function extractRatingLabel($) {
    const el = $('span[aria-label]')
        .filter((_, e) => ($(e).attr('aria-label') || '').includes('Rated'))
        .first();
    return el.length ? el.attr('aria-label') : null;
}

function extractTitle($) {
    const titleEl = $(SELECTORS.title).first();
    if (titleEl.length) return nodeText(titleEl.get(0));

    const title = $('title').first().text();
    return title ? title.trim() : null;
}

function extractDescription($) {
    const container = $(SELECTORS.description).first();
    if (!container.length) return null;

    let textEl = container.find(SELECTORS.descriptionText).first();
    if (!textEl.length) textEl = container;

    return cleanText(nodeText(textEl.get(0), ' '));
}

function extractRating(ratingLabel) {
    if (!ratingLabel) return null;
    const match = ratingLabel.match(/Rated\s+([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
}

function extractReviewCount(ratingLabel) {
    if (!ratingLabel) return null;
    const match = ratingLabel.match(/([\d,]+\.?\d*[kKmM]?)\s+(?:user\s+)?reviews?/);
    if (!match) return null;
    const raw = match[1].replace(/,/g, '');
    const suffix = raw.slice(-1).toLowerCase();
    if (suffix === 'k') return Math.trunc(parseFloat(raw.slice(0, -1)) * 1_000);
    if (suffix === 'm') return Math.trunc(parseFloat(raw.slice(0, -1)) * 1_000_000);
    return Math.trunc(parseFloat(raw));
}

function extractSpecs($) {
    const specs = {};
    $(SELECTORS.spec).each((_, el) => {
        const text = nodeText(el, ':');
        const sep = text.indexOf(':');
        if (sep !== -1) {
            const key = cleanText(text.slice(0, sep));
            const value = cleanText(text.slice(sep + 1));
            if (key && value !== null) specs[key] = value;
        }
    });
    return specs;
}

/**
 * Build the immersive URL for a variant by swapping the `pvf:` token inside the
 * `prds` parameter. The token is generated from the filter category and option
 * names (see pvf.js) rather than read from `data-pvf` attributes.
 */
function buildVariantUrl(baseUrl, pvf) {
    if (!baseUrl || !pvf) return null;
    let parsed;
    try {
        parsed = new URL(baseUrl);
    } catch {
        return null;
    }
    const prds = parsed.searchParams.get('prds');
    if (!prds) return null;
    const parts = prds.split(',').filter((p) => !p.startsWith('pvf:'));
    parts.push(`pvf:${pvf}`);
    parsed.searchParams.set('prds', parts.join(','));
    return parsed.toString();
}

function extractFilters($, $inj, baseUrl) {
    const filters = {};
    const seen = new Set();
    // Current selection state, used as the base every option is merged onto.
    const baseSelections = decodePvf(pvfFromUrl(baseUrl));

    const process = ($$) => {
        $$(SELECTORS.filterOption).each((_, el) => {
            const $el = $$(el);

            // 1. Category name from the parent list container.
            let category;
            const parentList = $el.closest(SELECTORS.filterList);
            if (parentList.length) {
                category = (parentList.attr('aria-label') || '').replace(' options', '').trim();
            } else {
                category = 'Unknown';
                const prevHeading = findPrevious($$, el, SELECTORS.filterHeading);
                if (prevHeading) {
                    category = nodeText(prevHeading, ':').split(':')[0].trim();
                }
            }

            // 2. Option name.
            const optionName = $el.attr('data-label') || cleanText(nodeText(el, ' '));

            // 3. Dedupe across both DOMs.
            const optKey = `${category} ${optionName}`;
            if (seen.has(optKey)) return;
            seen.add(optKey);

            // 4. Selected state.
            const ariaLabel = ($el.attr('aria-label') || '').toLowerCase();
            const isSelected = (
                $el.attr('data-selected') === 'true'
                || $el.attr('selected') === 'true'
                || ariaLabel.includes('currently selected')
            );

            if (!filters[category]) filters[category] = [];

            const opt = { name: optionName, selected: isSelected };

            // 5. Swatch image (commonly on colours).
            const imgUrl = $el.attr('data-img');
            if (imgUrl) opt.image = imgUrl;

            // 6. Variant link: encode a pvf token from the category/option names
            // (merged onto the current selection) and swap it into the input URL.
            if (category !== 'Unknown' && optionName) {
                const pvf = encodePvf(withSelection(baseSelections, category, optionName));
                const variantUrl = buildVariantUrl(baseUrl, pvf);
                if (variantUrl) opt.url = variantUrl;
            }

            filters[category].push(opt);
        });
    };

    process($);
    process($inj);

    return Object.entries(filters).map(([category, options]) => ({ category, options }));
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

    const $container = $card.find(SELECTORS.priceContainer).first();
    let $priceEl = $();
    if ($container.length) {
        $priceEl = findByAria($, $container, isCurrent);
    }
    if (!$priceEl.length) {
        $priceEl = findByAria($, $card, isCurrent);
    }

    if (!$priceEl.length && !$container.length) {
        return { price: null, price_label: null, currency: null };
    }

    const price = ($priceEl.length ? nodeText($priceEl.get(0)) : '')
        || ($container.length ? nodeText($container.get(0)) : '')
        || null;
    const priceLabel = $priceEl.length ? $priceEl.attr('aria-label') : null;
    const currency = ($container.length ? $container.attr('data-crcy') : null)
        || extractCurrency(price, priceLabel);

    return { price, price_label: priceLabel, currency };
}

function extractOldPrice($, cardNode) {
    const $oldPriceEl = findByAria($, $(cardNode), (a) => (
        a.startsWith('Old price was') || a.startsWith('Maximum retail price:')
    ));
    if (!$oldPriceEl.length) {
        return { old_price: null, old_price_label: null };
    }
    return {
        old_price: nodeText($oldPriceEl.get(0)) || null,
        old_price_label: $oldPriceEl.attr('aria-label'),
    };
}

function extractOfferTitle($, cardNode) {
    const titleEl = $(cardNode).find(SELECTORS.offerTitle).first();
    if (!titleEl.length) return null;
    return cleanText(nodeText(titleEl.get(0), ' '));
}

function extractOfferRating($, cardNode) {
    const ratingEl = findByAria($, $(cardNode), (a) => a.startsWith('Rated ') && a.includes(' out of 5'));
    if (!ratingEl.length) return null;
    return extractRating(ratingEl.attr('aria-label'));
}

function extractOfferStatus($, cardNode) {
    const statusEl = $(cardNode).find(SELECTORS.offerStatus).first();
    if (!statusEl.length) return null;
    return cleanText(nodeText(statusEl.get(0), ' '));
}

function extractOfferDelivery($, cardNode) {
    const deliveryEl = findByAria($, $(cardNode), (a) => a.toLowerCase().includes('delivery'));
    if (!deliveryEl.length) return null;
    return cleanText(deliveryEl.attr('aria-label')) || cleanText(nodeText(deliveryEl.get(0), ' '));
}

// New immersive layout: offers are listitems inside the offers grid.
function extractSellersNew($, $cards) {
    const sellers = [];
    const seen = new Set();

    $cards.each((_, cardNode) => {
        const $card = $(cardNode);

        const merchant = $card.find(SELECTORS.merchantContext).first().attr('data-report-feedback-about-context')
            || cleanText(nodeText($card.find(SELECTORS.merchantName).first().get(0), ' '));

        const linkEl = $card.find(SELECTORS.externalLink).first();
        const price = extractCurrentPrice($, cardNode);
        const oldPrice = extractOldPrice($, cardNode);

        let offerRating = null;
        const ratingEl = $card.find(SELECTORS.offerRatingNew).first();
        if (ratingEl.length) {
            const m = ratingEl.text().match(/([\d.]+)/);
            if (m) offerRating = parseFloat(m[1]);
        }

        let sellerLogo = null;
        const src = $card.find('img').first().attr('src') || '';
        if (src.startsWith('http') && !src.includes('data:image')) sellerLogo = src;

        const seller = {
            merchant: merchant || null,
            merchant_id: null,
            offer_id: $card.attr('data-sori-id') || null,
            title: extractOfferTitle($, cardNode),
            price: price.price,
            currency: price.currency,
            old_price: oldPrice.old_price,
            target_url: linkEl.length ? linkEl.attr('href') : null,
            status: extractOfferStatus($, cardNode),
            delivery: extractOfferDelivery($, cardNode),
            offer_rating: offerRating,
            seller_logo: sellerLogo,
        };

        const key = `${seller.merchant} ${seller.target_url}`;
        if (!seen.has(key)) {
            sellers.push(seller);
            seen.add(key);
        }
    });

    return sellers;
}

// Old immersive layout: offers carry data-merchant-name / data-target-url.
function extractSellersOld($, imageMap, offersGrid) {
    const sellers = [];
    const seen = new Set();

    const $merchants = offersGrid.length
        ? offersGrid.find(SELECTORS.merchantOld)
        : $(SELECTORS.merchantOld);

    $merchants.each((_, el) => {
        const $el = $(el);

        let $card = $el.closest(SELECTORS.offerCardOld);
        if (!$card.length) $card = $el.parent();
        if (!$card.length) $card = $el;
        const cardNode = $card.first().get(0);

        const linkEl = $(cardNode).find('a[href]').first();
        const price = extractCurrentPrice($, cardNode);
        const oldPrice = extractOldPrice($, cardNode);

        let sellerLogo = null;
        const imgTag = $(cardNode).find('img').first();
        if (imgTag.length) {
            const imgId = imgTag.attr('id');
            if (imgId && imageMap[imgId] && imageMap[imgId].startsWith('http')) {
                sellerLogo = imageMap[imgId];
            } else {
                const src = imgTag.attr('src') || imgTag.attr('data-src') || '';
                if (src.startsWith('http') && !src.includes('data:image')) {
                    sellerLogo = src;
                }
            }
        }

        const seller = {
            merchant: $el.attr('data-merchant-name') ?? null,
            merchant_id: $el.attr('data-merchantid') ?? null,
            offer_id: $el.attr('data-oid') ?? null,
            title: extractOfferTitle($, cardNode),
            price: price.price,
            currency: price.currency,
            old_price: oldPrice.old_price,
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

function extractSellers($, imageMap) {
    const offersGrid = $(SELECTORS.offersGrid).first();
    // New layout: offer cards are listitems (jsname="uwagwf") inside the grid.
    const $newCards = offersGrid.length ? offersGrid.find(SELECTORS.offerCardNew) : $();
    if ($newCards.length) return extractSellersNew($, $newCards);
    return extractSellersOld($, imageMap, offersGrid);
}

/**
 * Parse a Google Shopping immersive product page.
 *
 * @param {string} html Raw HTML of the fetched page.
 * @param {string} url Original input URL.
 * @param {string} finalUrl Final (post-redirect) URL fetched.
 * @returns {object} Structured product details.
 */
export function parseProduct(html, url, finalUrl) {
    const $ = cheerio.load(html);
    const imageMap = extractImageMap(html);
    const $inj = extractInjectedSoup($);

    const mainImage = extractMainImage($, imageMap);
    const ratingLabel = extractRatingLabel($);
    // Variant links need a URL that still carries `prds=`; redirects can drop it.
    const variantBaseUrl = (finalUrl && finalUrl.includes('prds=')) ? finalUrl : url;

    return {
        input_url: url,
        final_url: finalUrl,
        title: extractTitle($),
        description: extractDescription($),
        images: extractAllImages($, mainImage),
        rating: extractRating(ratingLabel),
        review_count: extractReviewCount(ratingLabel),
        features: extractSpecs($),
        filters: extractFilters($, $inj, variantBaseUrl),
        buying_options: extractSellers($, imageMap),
    };
}
