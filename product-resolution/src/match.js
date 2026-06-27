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

/**
 * Find the first buying option whose destination matches the source product, by
 * canonical URL (exact host+path) or by slug (substring of the destination URL).
 *
 * @returns {{ reason: 'canonical_url'|'slug', offer: object }|null}
 */
export function findMatch(buyingOptions, { canonical, slug }) {
    const canonicalNorm = normHostPath(canonical);
    const slugLower = slug ? slug.toLowerCase() : null;

    for (const offer of buyingOptions || []) {
        const dest = destUrl(offer.target_url || '');
        if (!dest) continue;
        const destNorm = normHostPath(dest);

        if (canonicalNorm && destNorm && destNorm === canonicalNorm) {
            return { reason: 'canonical_url', offer: { ...offer, resolved_url: dest } };
        }
        if (slugLower && dest.toLowerCase().includes(slugLower)) {
            return { reason: 'slug', offer: { ...offer, resolved_url: dest } };
        }
    }
    return null;
}
