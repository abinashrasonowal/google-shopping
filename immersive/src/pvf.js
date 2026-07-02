/**
 * Encode/decode Google's `pvf` variant-selection token (the `pvf:` entry inside
 * the immersive URL's `prds` parameter). It is a base64url-encoded protobuf:
 *
 *   message Pvf       { repeated Selection selections = 2; }
 *   message Selection { string category = 4; string value = 5; }
 *
 * e.g. "EhIiCGNhcGFjaXR5KgYxMjggZ2I"            = [capacity: "128 gb"]
 *      "EhIiCGNhcGFjaXR5KgYxMjggZ2ISDyIGY29sb3VyKgVibGFjaw"
 *                                               = [capacity: "128 gb", colour: "black"]
 *
 * Categories and values are the on-page filter names lowercased, so tokens can
 * be generated from names alone without relying on `data-pvf` attributes.
 */

const FIELD_SELECTION = 0x12; // field 2, wire type 2
const FIELD_CATEGORY = 0x22; //  field 4, wire type 2
const FIELD_VALUE = 0x2a; //     field 5, wire type 2

function varint(n) {
    const bytes = [];
    while (n > 0x7f) {
        bytes.push((n & 0x7f) | 0x80);
        n >>>= 7;
    }
    bytes.push(n);
    return bytes;
}

function lenDelimited(tag, payload) {
    return [tag, ...varint(payload.length), ...payload];
}

/** Encode `[{ category, value }]` into a pvf token (names are lowercased). */
export function encodePvf(selections) {
    const out = [];
    for (const { category, value } of selections) {
        const cat = [...Buffer.from(category.toLowerCase(), 'utf8')];
        const val = [...Buffer.from(value.toLowerCase(), 'utf8')];
        out.push(...lenDelimited(FIELD_SELECTION, [
            ...lenDelimited(FIELD_CATEGORY, cat),
            ...lenDelimited(FIELD_VALUE, val),
        ]));
    }
    return Buffer.from(out).toString('base64url');
}

function readVarint(buf, i) {
    let n = 0;
    let shift = 0;
    while (i < buf.length) {
        const b = buf[i++];
        n |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) return [n, i];
        shift += 7;
    }
    return [n, i];
}

/** Decode a pvf token back into `[{ category, value }]`; [] if empty/malformed. */
export function decodePvf(token) {
    if (!token) return [];
    let buf;
    try {
        buf = Buffer.from(token, 'base64url');
    } catch {
        return [];
    }
    const selections = [];
    let i = 0;
    while (i < buf.length) {
        const tag = buf[i++];
        if ((tag & 0x07) !== 2) return []; // only length-delimited fields expected
        let len;
        [len, i] = readVarint(buf, i);
        const end = i + len;
        if (end > buf.length) return [];
        if (tag === FIELD_SELECTION) {
            const sel = { category: '', value: '' };
            while (i < end) {
                const t = buf[i++];
                let l;
                [l, i] = readVarint(buf, i);
                const s = buf.toString('utf8', i, Math.min(i + l, end));
                if (t === FIELD_CATEGORY) sel.category = s;
                else if (t === FIELD_VALUE) sel.value = s;
                i += l;
            }
            selections.push(sel);
        }
        i = end;
    }
    return selections;
}

/**
 * Return `selections` with `category` set to `value`: replaced in place when the
 * category is already selected (keeping Google's ordering), appended otherwise.
 */
export function withSelection(selections, category, value) {
    const cat = category.toLowerCase();
    const val = value.toLowerCase();
    const next = selections.map((s) => (s.category === cat ? { category: cat, value: val } : s));
    if (!next.some((s) => s.category === cat)) next.push({ category: cat, value: val });
    return next;
}

/** Extract the current pvf token from an immersive URL's `prds` parameter. */
export function pvfFromUrl(url) {
    if (!url) return null;
    let prds;
    try {
        prds = new URL(url).searchParams.get('prds');
    } catch {
        return null;
    }
    if (!prds) return null;
    const part = prds.split(',').find((p) => p.startsWith('pvf:'));
    return part ? part.slice('pvf:'.length) : null;
}
