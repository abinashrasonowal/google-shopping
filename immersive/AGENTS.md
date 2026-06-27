# AGENTS.md — AI Agent Onboarding

> Read this file first. It gives you everything you need to understand and work on this repo without reading every file.

---

## What this repo is

**Apify actors** that scrape Google Shopping. The repo has **three independent branches**, each deployed as a separate actor:

| Branch | Actor purpose | Input | Output |
|---|---|---|---|
| `main` | Base / shared utilities | — | — |
| `shopping` | Search-results scraper | Search query + country | List of ~40 product listings |
| `immersive` | Product detail scraper | Product URL (with `prds=`) | Single product: specs, sellers, competitors |

You are currently on the **`immersive`** branch unless told otherwise. Do not mix logic from other branches.

---

## Architecture (`immersive` branch)

```
src/
  main.js                       # Entry: Actor lifecycle, input validation, URL building, fetch + block detection
  parser.js                     # Pure HTML parsing (cheerio) — no network, no Apify calls
  proxy_http_client.js          # The ONLY HTTP client: got-scraping + Apify residential proxy, with retries
.actor/
  actor.json                    # Actor metadata
  input_schema.json             # Defines: url (required), country (default "in")
  dataset_schema.json           # Output schema
Dockerfile                      # apify/actor-node:20, installs package.json
package.json                    # apify, cheerio, got-scraping (ESM, "type": "module")
```

### Data flow
```
Actor.getInput()
  → url, country
  → validateInput(url, country)
  → Actor.createProxyConfiguration({ groups: ["RESIDENTIAL"], countryCode: country.toUpperCase() })
  → new ProxyHttpClient(proxyUrl)
  → buildImmersiveUrl(url, country)        # injects ibp, hl, gl, udm params
  → httpClient.fetch(url)                  # got-scraping GET via proxy → [html, finalUrl]
  → isBlocked(html)?  → log warning, return null
  → parseProduct(html, url, finalUrl)      # cheerio
  → Actor.pushData(product)
```

This is a JavaScript (Node.js, ESM) Apify actor. Run locally with `apify run` or `npm start`.

---

## Key classes & functions

### `src/main.js`
- **`validateInput(url, country)`** → throws on missing/invalid url, non-https, non-Google domain, missing `prds`, or bad country code
- **`buildImmersiveUrl(url, country)`** → adds `ibp=oshop`, `hl=en`, `gl=<country>`, `udm=28` to the input URL (only if absent)
- **`runImmersive(httpClient, url, country)`** → orchestrates fetch + parse, saves `sparse-response.html` if result is empty
- top-level `Actor.init()` / `Actor.exit()` lifecycle → Apify actor entrypoint

### `src/parser.js` — exported functions
- `parseProduct(html, url, finalUrl)` → returns the full output object (loads cheerio internally)
- `isBlocked(html)` → checks for CAPTCHA / "unusual traffic" signals
- internal helpers: title (`data-attrid="product_title"` → `<title>`), specs (`data-attrid="product_attributes_facet"`), sellers (`data-merchant-name`), current price (`data-crcy` + `aria-label` "Current price:"), old price (`aria-label` "Old price was"/"Maximum retail price:"), filters (`data-pvf` across visible + injected DOM)

### `src/proxy_http_client.js`
- **`ProxyHttpClient`** — the only HTTP client; constructed with a `proxyUrl`; sends full browser-like headers via `got-scraping`; `fetch(url)` returns `[html, finalUrl]` and retries up to 3× with exponential backoff

---

## Output schema (single item pushed to dataset)

```ts
{
    "input_url":           string,        // URL from actor input
    "final_url":           string,        // Normalized Google immersive URL fetched
    "title":               string | null,
    "description":         string | null,
    "images":              string[],      // Product image URLs, primary image first
    "rating":              number | null, // e.g. 4.6
    "review_count":        number | null, // e.g. 11000 (handles "11k" → 11000)
    "features":            Record<string, string>, // e.g. {"Storage": "256 GB", "Color": "Black"}
    "filters": [{
        "category":        string,        // e.g. "Colour", "Capacity"
        "options": [{
            "name":        string,
            "selected":    boolean,
            "image":       string | null, // swatch image URL for colour variants (omitted if absent)
        }],
    }],
    "buying_options": [{
        "merchant":        string | null,
        "merchant_id":     string | null,
        "offer_id":        string | null,
        "title":           string | null,
        "price":           string | null, // e.g. "₹79,900"
        "currency":        string | null, // ISO 4217 e.g. "INR"
        "old_price":       string | null,
        "target_url":      string | null,
        "status":          string | null, // e.g. "In stock"
        "delivery":        string | null,
        "offer_rating":    number | null,
        "seller_logo":     string | null,
    }],
}
```

---

## Input schema

```ts
{
    "url":     string,       // Required. Google Shopping URL with prds= param
    "country": string,       // Optional. Default "in". 2-letter ISO e.g. "us", "gb"
}
```

---

## Gotchas & conventions

1. **`prds` param is required** — `validateInput()` throws if missing from the input URL
2. **Block detection** — checks for `"before you continue"`, `"unusual traffic"`, `"verify you're human"`, `"g-recaptcha"` in page text
3. **Sparse response** — if parsed product has no `features` AND no `buying_options`, the raw HTML is saved to the KV store as `sparse-response.html` for debugging
4. **Currency extraction** — `extractCurrency()` first checks symbol map (`₹→INR`, `$→USD`, `€→EUR`, `£→GBP`, `¥→JPY`), then regex for 3-letter uppercase ISO code
5. **Review count parsing** — handles `"11k"` → `11000` and `"1.2m"` → `1200000`
6. **Single HTTP client** — there is exactly one client, `ProxyHttpClient` (`src/proxy_http_client.js`); there is no abstract base or local/no-proxy client
7. **No Playwright / browser** — this actor is HTTP-only (got-scraping); do not add Playwright here
8. **Proxy group** — must use `RESIDENTIAL` group; `DATACENTER` group typically gets blocked by Google
9. **Retry logic** — `ProxyHttpClient.fetch()` retries up to 3 times with exponential backoff (1s, 2s, 4s) on any request error; handles transient `UPSTREAM502` / `590` errors from the residential proxy tier

---

## Running locally

```bash
# Install deps
npm install

# Run the actor locally with Apify input
apify run

# Run directly
npm start
```

---

## Branch-specific reminders

- **`immersive`** (this branch): input = product URL, output = 1 item with nested sellers/specs
- **`shopping`** branch: input = search query `q`, output = list of ~40 flat product listings
- Do **not** merge logic between branches — they are independent deployments
