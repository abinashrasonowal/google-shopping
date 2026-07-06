# Google Shopping Search Scraper

> The most reliable API to extract Google Shopping data without getting blocked.

Extract product listings from Google Shopping instantly. Get **prices, titles, ratings, reviews, store names, and product links**. Perfect for price monitoring, market research, and competitor analysis. Runs on Apify's infrastructure with advanced SERP proxies to bypass captchas and blocks.

## 🚀 Why use this Scraper?
- **Price Monitoring & Tracking:** Keep track of competitor pricing and adjust your strategies dynamically.
- **Market Research:** Analyze trending products, aggregate reviews, and discover new market opportunities.
- **Dropshipping & E-commerce:** Automate your product cataloging and pricing syncs.
- **Machine Learning & AI:** Build rich e-commerce datasets to train models.

## 🎯 Features
- **Bypass Captchas:** Automatically handles Google's anti-bot protections.
- **Lightning Fast:** Scrapes a page of results in under 10 seconds.
- **Global Support:** Search any country using standard 2-letter country codes (US, GB, IN, DE, etc.).
- **Clean Data Export:** Download your data in JSON, CSV, Excel, XML, or HTML formats.
- **Easy Integrations:** Works seamlessly with Make, Zapier, Google Sheets, or any custom API webhook.

## 🛠 Input Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes | — | Search query e.g. `wireless headphones` |
| `country` | string | | `in` | 2-letter country code e.g. `us`, `gb`, `de` |

**Example input (JSON):**
```json
{
  "query": "iphone 16",
  "country": "in"
}
```

## 📊 Sample Output (JSON)
The actor outputs a clean array of products. Here is a single product example:

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

## 💡 Pro Tips & Usage Notes
- **Location Matters:** Set the `country` input to match your target market. Prices and availability change dramatically based on region.
- **Missing Ratings:** `rating` and `review_count` are `null` if Google does not display them for a specific product.
- **URL Targeting:** The `url` field links to the Google Shopping product comparison page, NOT the retailer directly. To get retailer data and deep URLs, feed these URLs into our **Google Shopping Immersive** scraper!

## 🔐 Proxy Requirements
This actor uses **SERP proxies** (`GOOGLE_SERP` group) to reliably fetch Google Shopping results. Ensure SERP proxy access is enabled on your Apify account.

## 💸 Cost
Highly cost-effective. Typically scrapes **~40 products per run** in under 10 seconds. One run consumes approximately **$0.003 per run**.
