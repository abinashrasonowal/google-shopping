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
main.py                         # Entry: asyncio.run(main()) → src/scraper.main()
src/
  scraper.py                    # Actor entrypoint, URL building, HTTP fetch, block detection
  parser.py                     # Pure HTML parsing — no network, no Apify calls
  client/
    http_client.py              # Abstract base: async fetch(url) -> str
    proxy_http_client.py        # Production: aiohttp + Apify residential proxy
    local_http_client.py        # Dev/testing: aiohttp without proxy
    proxy.py                    # Helper: Actor.create_proxy_configuration() → proxy URL
.actor/
  actor.json                    # Actor metadata
  input_schema.json             # Defines: url (required), country (default "in")
  dataset_schema.json           # Output schema
Dockerfile                      # Python 3.11, installs requirements.txt
requirements.txt                # apify, beautifulsoup4[lxml], aiohttp, httpx, fastapi, uvicorn
```

### Data flow
```
Actor.get_input()
  → url, country
  → get_proxy_url(groups=["RESIDENTIAL"], country_code=country.upper())
  → ProxyHttpClient(proxy_url)
  → GoogleShoppingImmersiveScraper.build_immersive_url()   # injects ibp, hl, gl, udm params
  → http_client.fetch(url)                                  # aiohttp GET via proxy
  → BeautifulSoup(html)
  → is_blocked(soup)?  → log warning, return None
  → GoogleShoppingImmersiveParser.parse_product(soup, url, fetch_url)
  → Actor.push_data(product)
```

For local debugging, `test.py` can parse a saved `p.html` file and print the parser output without running the actor.

---

## Key classes & functions

### `src/scraper.py`
- **`GoogleShoppingImmersiveScraper`** — holds `url`, `country`, `http_client`
  - `build_immersive_url()` → appends `ibp=oshop`, `hl=en`, `gl=<country>`, `udm=28` to the input URL
  - `fetch_html()` → calls `http_client.fetch(built_url)`
  - `is_blocked(soup)` → checks for CAPTCHA / "unusual traffic" signals
- **`run_immersive(http_client, url, country)`** → orchestrates fetch + parse, saves `sparse-response.html` if result is empty
- **`main()`** → Apify Actor entrypoint

### `src/parser.py` — `GoogleShoppingImmersiveParser` (all `@staticmethod` / `@classmethod`)
- `parse_product(soup, url, fetch_url)` → returns the full output dict
- `_extract_title(soup)` → tries `data-attrid="product_title"`, falls back to `<title>`
- `_extract_specs(soup)` → finds all `data-attrid="product_attributes_facet"` elements → `{key: value}` dict
- `_extract_sellers(soup)` → finds all `data-merchant-name` elements → list of seller dicts
- `_extract_current_price(card)` → tries `data-crcy` container + `aria-label` starting with "Current price:"
- `_extract_old_price(card)` → `aria-label` starting with "Old price was" or "Maximum retail price:"
- `_extract_competing_products(soup)` → `data-attrid="apg-product-result"` elements

### `src/client/`
- **`HttpClient`** (ABC) — one method: `async fetch(url, **kwargs) -> str`
- **`ProxyHttpClient`** — production; needs `proxy_url` from `get_proxy_url()`; sends full browser-like headers
- **`LocalHttpClient`** — same headers, no proxy; use for local dev/testing

---

## Output schema (single item pushed to dataset)

```python
{
    "input_url":           str,           # URL from actor input
    "all_images":          list[str],     # Product image URLs, primary image first
    "title":               str | None,
    "rating":              float | None,  # e.g. 4.6
    "review_count":        int | None,    # e.g. 11000 (handles "11k" → 11000)
    "features":            dict[str, str],# e.g. {"Storage": "256 GB", "Color": "Black"}
    "buying_options": [{
        "merchant":        str,
        "merchant_id":     str,
        "offer_id":        str,
        "title":           str | None,
        "price":           str | None,    # e.g. "₹79,900"
        "currency":        str | None,    # ISO 4217 e.g. "INR"
        "old_price":       str | None,
        "target_url":      str | None,
        "status":          str | None,    # e.g. "In stock"
        "delivery":        str | None,
        "offer_rating":    float | None,
        "seller_logo":     str | None,
    }],
    "competing_products": [{
        "product_id":      str,
        "text":            str,
    }],
}
```

---

## Input schema

```python
{
    "url":     str,          # Required. Google Shopping URL with prds= param
    "country": str,          # Optional. Default "in". 2-letter ISO e.g. "us", "gb"
}
```

---

## Gotchas & conventions

1. **`prds` param is required** — `build_immersive_url()` raises `ValueError` if missing from the input URL
2. **Block detection** — checks for `"before you continue"`, `"unusual traffic"`, `"verify you're human"`, `"g-recaptcha"` in page text
3. **Sparse response** — if parsed product has no `features` AND no `buying_options`, the raw HTML is saved to the KV store as `sparse-response.html` for debugging
4. **Currency extraction** — `_extract_currency()` first checks symbol map (`₹→INR`, `$→USD`, `€→EUR`, `£→GBP`, `¥→JPY`), then regex for 3-letter uppercase ISO code
5. **Review count parsing** — handles `"11k"` → `11000` and `"1.2m"` → `1200000`
6. **`HttpClient` interface** — always program to the abstract `HttpClient`; swap `ProxyHttpClient` ↔ `LocalHttpClient` for prod vs local
7. **No Playwright / browser** — this actor is HTTP-only (aiohttp); do not add Playwright here
8. **Proxy group** — must use `RESIDENTIAL` group; `DATACENTER` group typically gets blocked by Google
9. **Retry logic** — `ProxyHttpClient.fetch()` retries up to 3 times with exponential backoff (1s, 2s, 4s) on `ClientHttpProxyError` and `ClientResponseError`; handles transient `UPSTREAM502` / `590` errors from the residential proxy tier

---

## Running locally

```bash
# Install deps
pip install -r requirements.txt

# Run the actor locally with Apify input
apify run

# Run without proxy (local dev) — swap ProxyHttpClient → LocalHttpClient in scraper.py temporarily
python main.py

# Parse a saved HTML sample for parser validation
python test.py p.html
```

---

## Branch-specific reminders

- **`immersive`** (this branch): input = product URL, output = 1 item with nested sellers/specs
- **`shopping`** branch: input = search query `q`, output = list of ~40 flat product listings
- Do **not** merge logic between branches — they are independent deployments
