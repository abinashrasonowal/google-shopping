# Google Shopping Immersive Scraper

Extract deep product details from a Google Shopping immersive product page — title, rating, specs/features, per-seller buying options (price, delivery, stock status), and competing products. Runs on Apify via residential proxies; no browser required.

## What it does

Given a Google Shopping product URL (the kind with a `prds=` query parameter), this actor fetches the immersive product panel and parses:

- **Product metadata** — title, aggregate rating, review count
- **Specifications** — key–value feature attributes (e.g. RAM, Storage, Color)
- **Buying options** — per-seller listings with price, currency, delivery info, and direct links
- **Competing products** — related product tiles shown by Google alongside the main listing

**Sample output:**
```json
{
  "input_url": "https://www.google.com/search?prds=eto:...&q=iphone+16",
  "fetch_url": "https://www.google.com/search?prds=eto:...&ibp=oshop&hl=en&gl=in&udm=28",
  "all_images": [
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR...",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS..."
  ],
  "title": "Apple iPhone 16 256GB",
  "rating": 4.6,
  "review_count": 11000,
  "features": {
    "Storage": "256 GB",
    "Color": "Black",
    "Model": "iPhone 16"
  },
  "buying_options": [
    {
      "merchant": "Flipkart",
      "merchant_id": "1234",
      "offer_id": "abc",
      "title": "Apple iPhone 16 256GB",
      "price": "₹79,900",
      "currency": "INR",
      "old_price": "₹89,900",
      "target_url": "https://www.flipkart.com/...",
      "status": "In stock",
      "delivery": "Free delivery by Tomorrow",
      "offer_rating": 4.5
    }
  ],
  "competing_products": [
    {
      "product_id": "...",
      "text": "Apple iPhone 15 128GB | ₹59,900 | Flipkart"
    }
  ]
}
```

## Input

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | **yes** | — | Google Shopping immersive product URL (must contain a `prds` query parameter) |
| `country` | string | | `in` | 2-letter country code for localized results e.g. `us`, `gb`, `de` |

**Example input:**
```json
{
  "url": "https://www.google.com/search?prds=eto:12345,pid:12345&q=iphone+16",
  "country": "in"
}
```

> **How to get the URL**: Open Google Shopping, click on any product to open its immersive panel, then copy the full URL from the browser address bar. It will contain a `prds=` parameter.

## Output

A single dataset item per run containing:

| Field | Type | Description |
|---|---|---|
| `input_url` | string | The URL provided as input |
| `fetch_url` | string | The full URL fetched (with injected `ibp`, `hl`, `gl`, `udm` params) |
| `all_images` | array[string] | List of product image URLs, with the primary image first |
| `title` | string | Product name |
| `rating` | number \| null | Aggregate rating out of 5 |
| `review_count` | integer \| null | Total number of reviews |
| `features` | object | Key–value product specifications (e.g. `{"Storage": "256 GB"}`) |
| `buying_options` | array | Per-seller listings (see below) |
| `competing_products` | array | Related products shown by Google |

### `buying_options` item

| Field | Type | Description |
|---|---|---|
| `merchant` | string | Seller name |
| `merchant_id` | string | Google's internal merchant ID |
| `offer_id` | string | Google's offer ID |
| `title` | string \| null | Offer-specific title if different from the product title |
| `price` | string \| null | Current price e.g. `₹79,900` |
| `currency` | string \| null | ISO 4217 currency code e.g. `INR`, `USD` |
| `old_price` | string \| null | Struck-through / MRP price if shown |
| `target_url` | string \| null | Direct link to the seller's product page |
| `status` | string \| null | Stock status e.g. `In stock` |
| `delivery` | string \| null | Delivery info e.g. `Free delivery by Tomorrow` |
| `offer_rating` | number \| null | Seller-level rating if shown |
| `seller_logo` | string \| null | Seller logo image URL if available |

## Usage notes

- `rating` and `review_count` are `null` when Google does not show them for the product
- `features` is an empty object `{}` when no specification attributes are present
- `all_images` is an array of product image URLs; the first entry is the primary image when present
- If Google returns a sparse/static page (no buying options or features), the raw HTML is saved as the `sparse-response.html` key–value store entry for debugging
- Results are localized to the `country` you provide — prices, sellers, and availability will reflect that market

## Local parser testing

A lightweight local harness is available for debugging HTML files.

```bash
python test.py p.html
```

This loads `p.html`, parses it with `GoogleShoppingImmersiveParser`, and prints the JSON output.

## Project structure

```
.
├── main.py                   # Entry point
├── src/
│   ├── scraper.py            # URL construction, HTTP fetching, block detection
│   ├── parser.py             # HTML parsing (GoogleShoppingImmersiveParser)
│   └── client/
│       ├── http_client.py    # Abstract HttpClient interface
│       ├── proxy_http_client.py  # Apify residential proxy implementation
│       └── local_http_client.py  # Local (non-proxy) implementation for dev
├── .actor/
│   ├── actor.json
│   ├── input_schema.json
│   └── dataset_schema.json
├── Dockerfile
└── requirements.txt
```

## Proxy requirements

This actor uses **residential proxies** (`RESIDENTIAL` group) to reliably fetch Google Shopping immersive pages. Make sure residential proxy access is enabled on your Apify account.

## Cost

Typically completes in under 10 seconds per run. One run consumes approximately **0.01–0.02 compute units**.
