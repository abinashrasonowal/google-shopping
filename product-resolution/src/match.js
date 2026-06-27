// Second-level labels that act as part of the public suffix (e.g. flipkart.co.in).
const PUBLIC_SLDS = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'gen', 'ind', 'nic']);

// Match strength, strongest first — a higher number wins.
const PRIORITY = { canonical_url: 4, slug: 3, domain: 2, merchant: 1 };

/** Unwrap a Google redirect (`/url?q=`, `/aclk?adurl=`, ...) to the real destination URL. */
function destUrl(targetUrl) {
    if (!targetUrl) return '';
    try {
        const u = new URL(targetUrl, 'https://www.google.com');
        for (const key of ['q', 'url', 'adurl', 'durl']) {
            const v = u.searchParams.get(key);
            if (v && /^https?:/i.test(v)) return v;
        }
        return u.href;
    } catch {
        return targetUrl;
    }
}

/** Normalize to "host/path" (no scheme, no www, no trailing slash, lowercased). */
function normHostPath(urlStr) {
    try {
        const u = new URL(urlStr);
        return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
    } catch {
        return '';
    }
}

/** Registrable domain, e.g. "https://dl.flipkart.com/x" -> "flipkart.com". */
function registrableDomain(urlOrHost) {
    let host = urlOrHost || '';
    try {
        host = new URL(urlOrHost).hostname;
    } catch {
        // already a host (or empty)
    }
    host = host.replace(/^www\./, '').toLowerCase();
    const labels = host.split('.').filter(Boolean);
    if (labels.length < 2) return host;
    let cut = labels.length - 2;
    if (labels.length >= 3 && PUBLIC_SLDS.has(labels[cut])) cut -= 1;
    return labels.slice(cut).join('.');
}

/**
 * Find the buying option that best matches the source product, by (strongest first):
 *   canonical_url (exact host+path) > slug (substring) > domain (same retailer) > merchant (name).
 *
 * @returns {{ reason: string, offer: object }|null}
 */
export function findMatch(buyingOptions, { canonical, slug, host, store }) {
    const canonicalNorm = normHostPath(canonical);
    const slugLower = slug ? slug.toLowerCase() : null;
    const srcDomain = registrableDomain(host || canonical || '');
    const storeLower = store ? store.toLowerCase() : null;

    let best = null;
    for (const offer of buyingOptions || []) {
        const dest = destUrl(offer.target_url || '');
        const destNorm = dest ? normHostPath(dest) : '';
        const destDomain = dest ? registrableDomain(dest) : '';
        const merchant = (offer.merchant || '').toLowerCase();

        let reason = null;
        if (canonicalNorm && destNorm && destNorm === canonicalNorm) {
            reason = 'canonical_url';
        } else if (slugLower && dest.toLowerCase().includes(slugLower)) {
            reason = 'slug';
        } else if (srcDomain && destDomain && destDomain === srcDomain) {
            reason = 'domain';
        } else if (storeLower && merchant && (merchant.includes(storeLower) || storeLower.includes(merchant))) {
            reason = 'merchant';
        }

        if (reason && (!best || PRIORITY[reason] > PRIORITY[best.reason])) {
            best = { reason, offer: { ...offer, resolved_url: dest || offer.target_url } };
            if (reason === 'canonical_url') break; // strongest possible — stop early
        }
    }
    return best;
}
