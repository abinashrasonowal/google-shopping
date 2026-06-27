const MAX_WORDS = 8;

// Noise words stripped before building the query — store boilerplate and filler.
const STOP_WORDS = new Set([
    'buy', 'online', 'price', 'prices', 'best', 'the', 'with', 'for', 'and', 'in',
    'at', 'of', 'a', 'an', 'new', 'official', 'store', 'shop', 'sale', 'offer',
    'offers', 'com', 'www', 'india', 'lowest', 'free', 'shipping', 'deal', 'deals',
    'on', 'from', 'by', 'to', 'get', 'now', 'latest',
]);

function words(value) {
    return (value || '')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        // Drop long all-digit tokens (product/SKU ids) but keep specs like 16, 128.
        .filter((w) => !/^\d{5,}$/.test(w));
}

/**
 * Build a cleaned search query of at most 8 words from the store name and the
 * product text (title preferred, slug as fallback). Store words come first,
 * duplicates are dropped, and noise words are removed.
 */
export function buildQuery(store, title, slug) {
    const productText = title || slug || '';
    const candidates = [...words(store), ...words(productText)].filter((w) => !STOP_WORDS.has(w));

    const out = [];
    const seen = new Set();
    for (const w of candidates) {
        if (seen.has(w)) continue;
        seen.add(w);
        out.push(w);
        if (out.length >= MAX_WORDS) break;
    }
    return out.join(' ');
}
