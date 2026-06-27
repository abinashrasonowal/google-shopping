import * as cheerio from 'cheerio';

function attr($, selector, name) {
    const el = $(selector).first();
    const v = el.length ? el.attr(name) : null;
    return v ? v.trim() : null;
}

/** Second-level domain as a coarse store name, e.g. "www.flipkart.com" -> "flipkart". */
function storeFromHost(urlStr) {
    try {
        const host = new URL(urlStr).hostname.replace(/^www\./, '');
        const parts = host.split('.');
        return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    } catch {
        return null;
    }
}

/** The product slug: the longest alphabetic path segment (handles /p/, /dp/, etc.). */
export function extractSlug(urlStr) {
    try {
        const segments = new URL(urlStr).pathname.split('/').filter(Boolean);
        if (!segments.length) return null;
        const candidate = segments
            .filter((s) => /[a-z]/i.test(s))
            .sort((a, b) => b.length - a.length)[0] || segments[segments.length - 1];
        return candidate.replace(/\.(html?|php|aspx)$/i, '') || null;
    } catch {
        return null;
    }
}

/**
 * Parse the OpenGraph / canonical metadata of an arbitrary retailer product page.
 *
 * @returns {{ store: string|null, title: string|null, canonical: string, slug: string|null, host: string|null }}
 */
export function parseMeta(html, finalUrl, inputUrl) {
    const $ = cheerio.load(html);

    const title = attr($, 'meta[property="og:title"]', 'content')
        || attr($, 'meta[name="twitter:title"]', 'content')
        || ($('title').first().text().trim() || null);

    const store = attr($, 'meta[property="og:site_name"]', 'content')
        || attr($, 'meta[name="application-name"]', 'content')
        || storeFromHost(finalUrl || inputUrl);

    const canonical = attr($, 'link[rel="canonical"]', 'href')
        || attr($, 'meta[property="og:url"]', 'content')
        || finalUrl
        || inputUrl;

    const slug = extractSlug(canonical) || extractSlug(inputUrl);

    let host = null;
    try {
        host = new URL(canonical).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        host = storeFromHost(canonical);
    }

    return { store, title, canonical, slug, host };
}
