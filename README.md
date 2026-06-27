# Google Shopping Scrapers

Two independent Apify actors for scraping Google Shopping, written in JavaScript (Node.js, ESM). Each lives in its own directory and is deployed separately.

| Directory | Actor | Input | Output |
|---|---|---|---|
| [`shopping/`](shopping/) | Search-results scraper | `query` + `country` | List of ~40 product listings |
| [`immersive/`](immersive/) | Product-detail scraper | product `url` (with `prds=`) + `country` | Single product: specs, sellers, filters |

Both share the same shape:

```
<actor>/
├── .actor/            # actor.json, input/output/dataset schemas, openapi
├── src/
│   ├── main.js        # Actor lifecycle, URL building, fetch, block detection
│   ├── parser.js      # HTML parsing (cheerio)
│   └── proxy_http_client.js  # the only HTTP client: Apify proxy via got-scraping
├── Dockerfile         # apify/actor-node:20
└── package.json
```

## Deploying

Each directory is a self-contained, independently deployable actor. From inside the actor's directory:

```bash
cd shopping      # or: cd immersive
npm install
apify run        # run locally
apify push       # deploy to Apify
```

The `apify` CLI uses the build context of the current directory (its `.actor/`, `Dockerfile`, and `package.json`), so the two actors never interfere with each other.

## Proxy requirements

- **shopping** uses `GOOGLE_SERP` proxies.
- **immersive** uses `RESIDENTIAL` proxies.

Make sure the relevant proxy access is enabled on your Apify account.
