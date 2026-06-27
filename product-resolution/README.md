# Product Resolution Engine

Given a **retailer product URL** (Flipkart, Amazon, etc.), this actor finds the matching product on Google Shopping and returns the matching buying option — without you knowing the Google product id.

## How it works

```
input url
  → fetch page meta via RESIDENTIAL proxy        (store, title, canonical URL, slug)
  → build cleaned search query (store + title/slug, <= 8 words)
  → Google Shopping search via GOOGLE_SERP proxy  (top N product results)
  → fetch each result's immersive page in parallel via RESIDENTIAL proxy
  → match a buying option by canonical URL or slug
  → resolve on the FIRST matching hit (does not wait for all immersive fetches)
```

The query is built from the store name plus the product title (falling back to the
URL slug), lowercased, stripped of punctuation and noise words (`buy`, `online`,
`price`, ...), de-duplicated, and capped at **8 words**.

Matching compares each Google Shopping buying option's destination URL (Google
redirects are unwrapped) against the source page's **canonical URL** (exact
host + path) or **slug** (substring).

## Input

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | **yes** | — | Retailer product page URL to resolve |
| `country` | string | | `in` | 2-letter country code e.g. `us`, `gb`, `de` |
| `maxResults` | integer | | `12` | How many top search results to resolve in parallel |

```json
{
  "url": "https://www.flipkart.com/apple-iphone-16-ultramarine-128-gb/p/itm5cd9b327d7a8b",
  "country": "in"
}
```

## Output

A single dataset item:

| Field | Type | Description |
|---|---|---|
| `input_url` | string | The URL provided as input |
| `final_url` | string | Final URL after redirects when fetching the input page |
| `store` | string \| null | Detected store name |
| `title` | string \| null | Product title from page meta |
| `canonical_url` | string \| null | Canonical product URL from the page |
| `slug` | string \| null | Product slug derived from the URL |
| `query` | string | The cleaned search query used |
| `results_considered` | integer | Number of search results resolved |
| `matched` | boolean | Whether a matching offer was found |
| `match_reason` | string \| null | `canonical_url` or `slug` |
| `matched_offer` | object \| null | The matching buying option (incl. `resolved_url`) |
| `product` | object \| null | The immersive product that contained the match (title, immersive_url, all buying_options) |

## Proxy requirements

Needs both **residential** (`RESIDENTIAL`) and **Google SERP** (`GOOGLE_SERP`)
proxy access enabled on your Apify account.

## Run locally

```bash
npm install
apify run
```
