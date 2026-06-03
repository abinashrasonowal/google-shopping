from __future__ import annotations

from __future__ import annotations

import asyncio

from apify import Actor
from bs4 import BeautifulSoup

from src.client.http_client import HttpClient
from src.client.proxy import get_proxy_url
from src.client.proxy_http_client import ProxyHttpClient
from src.scraper.google_shopping import GoogleShoppingScraper


async def run_shopping(http_client: HttpClient, query: str, country: str) -> list[dict]:
    scraper = GoogleShoppingScraper(query, country, http_client)
    Actor.log.info('Searching for %r in %s', query, country)

    html = await scraper.fetch_html()
    Actor.log.info('Fetched %d bytes of HTML', len(html))

    soup = BeautifulSoup(html, 'html.parser')
    if scraper.is_blocked(soup):
        Actor.log.warning('Blocked by Google (captcha / unusual traffic)')
        return []

    products = scraper.parse_products(soup)
    Actor.log.info('Found %d products', len(products))
    return products


async def main() -> None:
    async with Actor:
        actor_input = await Actor.get_input() or {}
        query = actor_input.get('q')
        country = actor_input.get('country', 'in')

        if not query:
            raise ValueError('Input field "q" is required for shopping mode')

        proxy_url = await get_proxy_url(groups=['GOOGLE_SERP'], country_code=country.upper())
        http_client = ProxyHttpClient(proxy_url)

        products = await run_shopping(http_client, query, country)
        for product in products:
            await Actor.push_data(product)

        Actor.log.info('Pushed %d products to dataset', len(products))


if __name__ == '__main__':
    asyncio.run(main())
