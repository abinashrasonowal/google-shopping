# Google Shopping Scraper

Extract product listings from Google Shopping — title, price, rating, reviews, store, and product links. No browser required; runs fast on Apify's infrastructure with SERP proxies.

## What it does

Searches Google Shopping for any query and returns structured product data directly from the listing page — no JavaScript rendering needed.

**Sample output:**
```json
{
  "position": 1,
  "title": "Apple iPhone 16 256GB",
  "price": "₹79,900",
  "rating": 4.6,
  "review_count": 11000,
  "source": "Flipkart",
  "url": "https://www.google.com/search?ibp=oshop&...",
  "image": "https://encrypted-tbn0.gstatic.com/shopping?..."
}
```

## Input

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes | — | Search query e.g. `wireless headphones` |
| `country` | string | | `in` | 2-letter country code e.g. `us`, `gb`, `de` |

**Example input:**
```json
{
  "query": "iphone 16",
  "country": "in"
}
```

## Output

Each item in the dataset contains:

| Field | Type | Description |
|---|---|---|---|
| `position` | integer | Position in search results |
| `title` | string | Product name |
| `price` | string | Current price e.g. `₹79,900` |
| `rating` | number | Average rating out of 5 |
| `review_count` | integer | Total review count |
| `source` | string | Primary store name |
| `url` | string | Google Shopping product URL |
| `image` | string | Product image URL |

## Usage notes

- Results reflect Google Shopping listings for the given country — prices and availability vary by region
- `rating` and `review_count` are `null` when Google does not show them for a product
- The `url` field links to the Google Shopping comparison page, not the retailer directly
- Set `country` to match your target market for accurate pricing and store results

## Proxy requirements

This actor uses **SERP proxies** (`GOOGLE_SERP` group) to reliably fetch Google Shopping results. Make sure SERP proxy access is enabled on your Apify account.

## Cost

Typically scrapes **40 products per run** in under 10 seconds. One run consumes approximately 0.01–0.02 compute units.
