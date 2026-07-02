import * as cheerio from 'cheerio';

/** Detect Google block / CAPTCHA pages. */
export function isBlocked(html) {
    // 'g-recaptcha' is a class attribute, so it only shows up in the raw markup.
    if (html.toLowerCase().includes('g-recaptcha')) return true;
    const text = cheerio.load(html).text().toLowerCase();
    return [
        'before you continue',
        'unusual traffic',
        "verify you're human",
    ].some((s) => text.includes(s));
}
