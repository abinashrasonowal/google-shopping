/**
 * CSS selectors for the Google Shopping immersive product page (`ibp=oshop`).
 * Google rotates the obfuscated class names — when parsing breaks, update here.
 * The `data-attrid` / `jsname` attribute selectors are more stable than class names.
 */
export const SELECTORS = {
    /** Product title container. */
    title: '[data-attrid="product_title"]',
    /** Product description container. */
    description: '[data-attrid="product_description"]',
    /** Inner text element of the description, when present. */
    descriptionText: '#description_container',
    /** One spec row per element, text formatted as "key: value". */
    spec: '[data-attrid="product_attributes_facet"]',
    /** Variant filter options (colour, storage, ...). */
    filterOption: '[data-pvf]',
    /** Filter list container whose aria-label names the category ("Color options"). */
    filterList: '[role="list"][aria-label]',
    /** Fallback category heading preceding a filter option. */
    filterHeading: '[role="heading"]',
    /** Gallery images with a lazy-loaded data-src. */
    galleryImage: '[data-item-index][data-src]',
    /** Main product image meta tag. */
    mainImageMeta: 'meta[property="og:image"]',
    /** Offers grid holding all seller cards. */
    offersGrid: '[data-attrid="organic_offers_grid"]',
    /** New-layout offer cards inside the offers grid. */
    offerCardNew: '[jsname="uwagwf"][role="listitem"]',
    /** Old-layout merchant elements carrying data-merchant-name / data-target-url. */
    merchantOld: '[data-merchant-name]',
    /** Old-layout offer card ancestor of a merchant element. */
    offerCardOld: '[role="listitem"]',
    /** New-layout merchant name: attribute carrier and text fallback. */
    merchantContext: '[data-report-feedback-about-context]',
    merchantName: '.gUf0b',
    /** Offer title within a seller card. */
    offerTitle: '.rYkzq.y1FcZd',
    /** Offer stock/status line ("In stock"). */
    offerStatus: '.OaQPmf',
    /** New-layout seller rating badge. */
    offerRatingNew: '.NFq8Ad',
    /** Price container carrying the data-crcy currency attribute. */
    priceContainer: '[data-crcy]',
    /** Outbound merchant link in a seller card. */
    externalLink: 'a[href^="http"]',
};
