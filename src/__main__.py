from __future__ import annotations

import asyncio

from apify import Actor
from bs4 import BeautifulSoup

from src.client.http_client import HttpClient
from src.client.proxy import get_proxy_url
from src.client.proxy_http_client import ProxyHttpClient
from src.scraper.google_shopping import GoogleShoppingScraper
from src.scraper.google_shopping_immersive import GoogleShoppingImmersiveScraper

async def search(http_client: HttpClient, query: str, country: str) -> list[dict]:
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

async def scrape_product(http_client: HttpClient, url: str, country: str) -> dict | None:
    scraper = GoogleShoppingImmersiveScraper(url, country, http_client)
    fetch_url = scraper.build_immersive_url()
    Actor.log.info('Fetching immersive product URL: %s', fetch_url)
    html = await scraper.fetch_html()
    Actor.log.info('Fetched %d bytes of HTML', len(html))

    soup = BeautifulSoup(html, 'html.parser')
    if scraper.is_blocked(soup):
        Actor.log.warning('Blocked by Google (captcha / unusual traffic)')
        return None

    return scraper.parse_product(soup)

async def main() -> None:
    async with Actor:
        actor_input = await Actor.get_input() or {}
        mode = actor_input.get('mode')
        query = actor_input.get('q')
        url = actor_input.get('url')
        country = actor_input.get('country', 'in')

        if not mode:
            mode = 'immersive' if url else 'shopping'

        if mode not in {'shopping', 'immersive'}:
            raise ValueError('Input field "mode" must be "shopping" or "immersive"')

        proxy_groups = ['GOOGLE_SERP'] if mode == 'shopping' else ['RESIDENTIAL']
        proxy_url = await get_proxy_url(groups=proxy_groups, country_code=country.upper())
        http_client = ProxyHttpClient(proxy_url)

        if mode == 'shopping':
            if not query:
                raise ValueError('Input field "q" is required for shopping mode')

            products = await search(http_client, query, country)
            for product in products:
                await Actor.push_data(product)
            Actor.log.info('Pushed %d products to dataset', len(products))
        else:
            if not url:
                raise ValueError('Input field "url" is required for immersive mode')

            product = await scrape_product(http_client, url, country)
            if product:
                await Actor.push_data(product)
                Actor.log.info('Pushed immersive product details to dataset')

if __name__ == '__main__':
    asyncio.run(main())
