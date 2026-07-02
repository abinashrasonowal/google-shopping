/**
 * CSS selectors for the Google Shopping search-results page (`tbm=shop`).
 * Google rotates these obfuscated class names — when parsing breaks, update here.
 */
export const SELECTORS = {
    /** Product cards: the older `.Ez5pwe` grid and the newer `.YBo8bb` list layout. */
    productCard: '.Ez5pwe, .YBo8bb',
    /** Inner container carrying the data-cid/gid/oid/iid/pid/rds attributes. */
    dataContainer: '[data-cid]',
    /** Product title. */
    title: '.gkQHve',
    /** Price. */
    price: '.lmQWe',
    /** Tag slot next to the price: condition ("Pre-owned") or discount ("5% off ₹69,900"). */
    priceTag: '.W0uRhb',
    /** Merchant / seller source name. */
    source: '.WJMUdc',
    /** Rating stars, carrying an aria-label like "Rated 4.5 out of 5". */
    rating: '[role="img"][aria-label*="Rated"]',
    /** Card containers inside the injected (jsl.dh) HTML, used for the fallback image map. */
    injectedCard: '[data-pid], .MUWJ8c, g-inner-card',
    /** Deferred-image placeholders whose real URL lives in the google.ldi map. */
    deferredImage: 'img[id^="dimg_"]',
};
