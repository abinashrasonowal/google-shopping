from __future__ import annotations

import re
from urllib.parse import parse_qs, urlencode, urlparse

from bs4 import BeautifulSoup

from src.client.http_client import HttpClient

_OSHOP_BASE_URL = "http://www.google.com/search"


class GoogleShoppingImmersiveScraper:
    def __init__(self, url: str, country: str, http_client: HttpClient) -> None:
        self.url = url
        self.country = country
        self.http_client = http_client

    def build_immersive_url(self) -> str:
        parsed_url = urlparse(self.url)
        query_params = parse_qs(parsed_url.query)
        prds = query_params.get('prds', [''])[0]
        if not prds:
            raise ValueError('Input URL must contain a prds query parameter')

        params: dict[str, str] = {
            'ibp': query_params.get('ibp', ['oshop'])[0],
            'prds': prds,
            'q': query_params.get('q', [''])[0],
            'hl': query_params.get('hl', ['en'])[0],
            'gl': query_params.get('gl', [self.country])[0],
            'udm': query_params.get('udm', ['28'])[0],
        }
        if 'pvorigin' in query_params:
            params['pvorigin'] = query_params['pvorigin'][0]

        return f'{_OSHOP_BASE_URL}?{urlencode(params)}'

    async def fetch_html(self) -> str:
        return await self.http_client.fetch(self.build_immersive_url())

    @staticmethod
    def is_blocked(soup: BeautifulSoup) -> bool:
        page_text = soup.get_text().lower()
        return any(s in page_text for s in [
            'before you continue',
            'unusual traffic',
            "verify you're human",
            'g-recaptcha',
        ])

    @staticmethod
    def _extract_rating_label(soup: BeautifulSoup) -> str | None:
        el = soup.find('span', attrs={'aria-label': lambda value: value and 'Rated' in str(value)})
        if not el:
            return None
        return el.get('aria-label')

    @staticmethod
    def _extract_rating(rating_label: str | None) -> float | None:
        if not rating_label:
            return None
        match = re.search(r'Rated\s+([\d.]+)', rating_label)
        return float(match.group(1)) if match else None

    @staticmethod
    def _extract_review_count(rating_label: str | None) -> int | None:
        if not rating_label:
            return None
        match = re.search(r'([\d,]+\.?\d*[kKmM]?)\s+(?:user\s+)?reviews?', rating_label)
        if not match:
            return None
        raw = match.group(1).replace(',', '')
        suffix = raw[-1].lower()
        if suffix == 'k':
            return int(float(raw[:-1]) * 1_000)
        if suffix == 'm':
            return int(float(raw[:-1]) * 1_000_000)
        return int(float(raw))

    @staticmethod
    def _extract_specs(soup: BeautifulSoup) -> dict[str, str]:
        specs = {}
        for el in soup.find_all(attrs={'data-attrid': 'product_attributes_facet'}):
            parts = el.get_text(separator=':', strip=True).split(':', 1)
            if len(parts) == 2:
                specs[parts[0].strip()] = parts[1].strip()
        return specs

    @staticmethod
    def _extract_sellers(soup: BeautifulSoup) -> list[dict[str, str | None]]:
        sellers = []
        seen: set[tuple[str | None, str | None, str | None]] = set()
        for el in soup.find_all(attrs={'data-merchant-name': True}):
            seller = {
                'merchant': el.get('data-merchant-name'),
                'merchant_id': el.get('data-merchantid'),
                'offer_id': el.get('data-oid'),
            }
            seller_key = (seller['merchant'], seller['merchant_id'], seller['offer_id'])
            if seller_key not in seen:
                sellers.append(seller)
                seen.add(seller_key)
        return sellers

    @staticmethod
    def _extract_competing_products(soup: BeautifulSoup) -> list[dict[str, str | None]]:
        competitors = []
        for el in soup.find_all(attrs={'data-attrid': 'apg-product-result'}):
            competitors.append({
                'product_id': el.get('data-pid'),
                'text': el.get_text(separator=' | ', strip=True),
            })
        return competitors

    def parse_product(self, soup: BeautifulSoup) -> dict:
        title_el = soup.find(attrs={'data-attrid': 'product_title'})
        rating_label = self._extract_rating_label(soup)

        return {
            'input_url': self.url,
            'fetch_url': self.build_immersive_url(),
            'title': title_el.get_text(strip=True) if title_el else None,
            'rating_label': rating_label,
            'rating': self._extract_rating(rating_label),
            'review_count': self._extract_review_count(rating_label),
            'features': self._extract_specs(soup),
            'sellers': self._extract_sellers(soup),
            'competing_products': self._extract_competing_products(soup),
        }
