from __future__ import annotations

import asyncio

from apify import Actor
from bs4 import BeautifulSoup

from src.client.http_client import HttpClient
from src.client.proxy import get_proxy_url
from src.client.proxy_http_client import ProxyHttpClient
from src.scraper.google_shopping_immersive import GoogleShoppingImmersiveScraper


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

    product = scraper.parse_product(soup)
    Actor.log.info(
        'Parsed product blocks: title=%s features=%d buying_options=%d competing_products=%d',
        product.get('title'),
        len(product.get('features') or {}),
        len(product.get('buying_options') or []),
        len(product.get('competing_products') or []),
    )
    if not product.get('features') and not product.get('buying_options'):
        Actor.log.warning(
            'Fetched HTML did not contain Google Shopping immersive product blocks. '
            'This usually means Google returned a sparse/static variant for this request.'
        )
        await Actor.set_value('sparse-response.html', html, content_type='text/html')

    return product


async def main() -> None:
    async with Actor:
        actor_input = await Actor.get_input() or {}
        url = actor_input.get('url')
        country = actor_input.get('country', 'in')

        if not url:
            raise ValueError('Input field "url" is required')

        proxy_url = await get_proxy_url(groups=['RESIDENTIAL'], country_code=country.upper())
        http_client = ProxyHttpClient(proxy_url)

        product = await scrape_product(http_client, url, country)
        if product:
            await Actor.push_data(product)
            Actor.log.info('Pushed immersive product details to dataset')


if __name__ == '__main__':
    asyncio.run(main())
