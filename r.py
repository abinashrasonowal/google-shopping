from __future__ import annotations

import json
from pathlib import Path

from bs4 import BeautifulSoup

from src.scraper.google_shopping_immersive import GoogleShoppingImmersiveScraper


class DummyHttpClient:
    async def fetch(self, url: str) -> str:
        raise RuntimeError('DummyHttpClient is only for local HTML parsing')


def main() -> None:
    html = Path('r.html').read_text(encoding='utf-8')
    soup = BeautifulSoup(html, 'html.parser')

    scraper = GoogleShoppingImmersiveScraper(
        url='https://www.google.com/search?ibp=oshop&prds=pid:123&q=iphone%2016&hl=en&gl=in&udm=28',
        country='in',
        http_client=DummyHttpClient(),
    )

    product = scraper.parse_product(soup)
    print(json.dumps(product, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
