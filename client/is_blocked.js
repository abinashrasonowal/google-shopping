import * as cheerio from 'cheerio';

/** Detect Google block / CAPTCHA pages. */
export function isBlocked(html) {
    const text = cheerio.load(html).text().toLowerCase();
    return [
        'before you continue',
        'unusual traffic',
        "verify you're human",
        'g-recaptcha',
    ].some((s) => text.includes(s));
}
