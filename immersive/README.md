# Google Shopping Product Details & Sellers Scraper

> Extract rich product data, specifications, and all seller pricing from Google Shopping immersive pages.

Extract deep product details directly from a Google Shopping product page. Get the **title, rating, specs, feature attributes, competing products, and most importantly, per-seller buying options (price, delivery, stock status, direct links)**. Runs on Apify via residential proxies; no browser required.

## 🚀 Why use this Scraper?
- **Competitor Pricing:** Extract every seller offering a specific product to see exactly who is charging what.
- **Product Intelligence:** Scrape rich product metadata, features, and specifications without manually building catalogs.
- **Stock & Delivery Tracking:** Monitor if competitors have items "In stock" and their estimated delivery times.
- **Market Research:** Discover what related or competing products Google is recommending.

## 🎯 Features
- **Deep Extraction:** Pulls full specs (RAM, Storage, Color, etc.) and product variants.
- **Seller-Level Data:** Get the exact price, shipping cost, and direct deep-link to the retailer's actual product page.
- **Bypass Protections:** Powered by Apify Residential Proxies to slip past Google's defenses.
- **Clean Data Export:** Download your data in JSON, CSV, Excel, XML, or HTML formats.
- **Easy Integrations:** Connects directly with Make, Zapier, Google Sheets, or your own API.

## 🛠 Input Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | **yes** | — | Google Shopping immersive product URL (must contain a `prds` parameter) |
| `country` | string | | `in` | 2-letter country code for localized results e.g. `us`, `gb`, `de` |

**Example input (JSON):**
```json
{
  "url": "https://www.google.com/search?prds=eto:12345,pid:12345&q=iphone+16",
  "country": "in"
}
```
> **How to get the URL**: Open Google Shopping, click on any product to open its immersive panel, then copy the full URL from the browser address bar. It will contain a `prds=` parameter.

## 📊 Sample Output (JSON)
The actor outputs an incredibly detailed dataset containing specs and seller offers:

```json
{
  "input_url": "https://www.google.com/search?prds=eto:...&q=iphone+16",
  "final_url": "https://www.google.com/search?prds=eto:...&ibp=oshop&hl=en&gl=in&udm=28",
  "title": "Apple iPhone 16 256GB",
  "description": "The latest iPhone with A18 chip and 48MP camera",
  "images": [
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR..."
  ],
  "rating": 4.6,
  "review_count": 11000,
  "features": {
    "Storage": "256 GB",
    "Color": "Black",
    "Model": "iPhone 16"
  },
  "filters": [
    {
      "category": "Colour",
      "options": [
        { "name": "Black", "selected": true, "image": null }
      ]
    }
  ],
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
      "offer_rating": 4.5,
      "seller_logo": null
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

## 💡 Pro Tips & Usage Notes
- **Empty Attributes:** `features` will be an empty object `{}` if Google doesn't list spec attributes for the product. `rating` and `review_count` will be `null` if none exist.
- **Location Accuracy:** Set the `country` to match your target market for accurate local pricing, sellers, and availability.
- **Debugging:** If Google returns a sparse/static page (no buying options or features), the raw HTML is saved as a `sparse-response.html` key–value store entry so you can investigate why.

## 🔐 Proxy Requirements
This actor uses **residential proxies** (`RESIDENTIAL` group) to reliably fetch Google Shopping immersive pages. Ensure residential proxy access is enabled on your Apify account.

## 💸 Cost
Typically completes in under 10 seconds per run. One run consumes approximately **$0.003 per run**.
