from __future__ import annotations

import asyncio
from urllib.parse import urlencode

from apify import Actor
from bs4 import BeautifulSoup

from src.client.http_client import HttpClient
from src.client.proxy import get_proxy_url
from src.client.proxy_http_client import ProxyHttpClient
from src.parser import GoogleShoppingParser

_OSHOP_BASE_URL = "https://www.google.com/search"


class GoogleShoppingScraper:
    def __init__(self, query: str, country: str, http_client: HttpClient) -> None:
        self.query = query
        self.country = country
        self.http_client = http_client

    def _build_search_url(self, start: int = 0) -> str:
        params = {
            'q': self.query,
            'tbm': 'shop',
            'hl': 'en',
            'gl': self.country,
        }
        if start:
            params['start'] = str(start)
        return 'http://www.google.com/search?' + urlencode(params)

    async def fetch_html(self, start: int = 0) -> str:
        return await self.http_client.fetch(self._build_search_url(start))

    @staticmethod
    def is_blocked(soup: BeautifulSoup) -> bool:
        page_text = soup.get_text().lower()
        return any(s in page_text for s in [
            'before you continue',
            'unusual traffic',
            "verify you're human",
            'g-recaptcha',
        ])


async def run_shopping(http_client: HttpClient, query: str, country: str) -> list[dict]:
    scraper = GoogleShoppingScraper(query, country, http_client)
    parser = GoogleShoppingParser(query, country)
    Actor.log.info('Searching for %r in %s', query, country)

    html = await scraper.fetch_html()
    Actor.log.info('Fetched %d bytes of HTML', len(html))

    soup = BeautifulSoup(html, 'html.parser')
    if scraper.is_blocked(soup):
        Actor.log.warning('Blocked by Google (captcha / unusual traffic)')
        return []

    products = parser.parse_products(soup)
    Actor.log.info('Parsed %d products', len(products))

    return products


async def main() -> None:
    async with Actor:
        actor_input = await Actor.get_input() or {}
        query = actor_input.get('q')
        country = actor_input.get('country', 'in')

        if not query:
            raise ValueError('Input field "q" is required')

        proxy_url = await get_proxy_url(groups=['GOOGLE_SERP'], country_code=country.upper())
        http_client = ProxyHttpClient(proxy_url)

        products = await run_shopping(http_client, query, country)
        if products:
            await Actor.push_data(products)
            Actor.log.info('Pushed %d products to dataset', len(products))


if __name__ == '__main__':
    asyncio.run(main())
    