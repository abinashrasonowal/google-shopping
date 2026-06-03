from __future__ import annotations

import re
from urllib.parse import parse_qs, urlencode, urlparse

from bs4 import BeautifulSoup

from src.client.http_client import HttpClient

_OSHOP_BASE_URL = "https://www.google.com/search"
_SHOP_LOGO_CLASS = 'XNo5Ab'
_CURRENCY_BY_SYMBOL = {
    '₹': 'INR',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
}


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

        params = dict(query_params)
        params.setdefault('ibp', ['oshop'])
        params.setdefault('hl', ['en'])
        params.setdefault('gl', [self.country])
        params.setdefault('udm', ['28'])

        return f'{_OSHOP_BASE_URL}?{urlencode(params, doseq=True)}'

    async def fetch_html(self) -> str:
        return await self.http_client.fetch(self.build_immersive_url())

    @staticmethod
    def _clean_text(value: str | None) -> str | None:
        if not value:
            return None
        return re.sub(r'\s+', ' ', value).strip()

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
    def _extract_title(soup: BeautifulSoup) -> str | None:
        title_el = soup.find(attrs={'data-attrid': 'product_title'})
        if title_el:
            return title_el.get_text(strip=True)

        if soup.title and soup.title.string:
            return soup.title.string.strip()

        return None

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
                key = GoogleShoppingImmersiveScraper._clean_text(parts[0])
                value = GoogleShoppingImmersiveScraper._clean_text(parts[1])
                if key and value is not None:
                    specs[key] = value
        return specs

    @staticmethod
    def _extract_current_price(card: BeautifulSoup) -> dict[str, str | None]:
        price_container = card.find(attrs={'data-crcy': True})
        price_el = None
        if price_container:
            price_el = price_container.find(attrs={
                'aria-label': lambda value: value and str(value).startswith(('Current price:', 'Current price is')),
            })
        if not price_el:
            price_el = card.find(attrs={
                'aria-label': lambda value: value and str(value).startswith(('Current price:', 'Current price is')),
            })

        if not price_el and not price_container:
            return {'price': None, 'price_label': None, 'currency': None}

        price = price_el.get_text(strip=True) if price_el else None
        price = price or (price_container.get_text(strip=True) if price_container else None)
        price_label = price_el.get('aria-label') if price_el else None
        currency = price_container.get('data-crcy') if price_container else None

        return {
            'price': price,
            'price_label': price_label,
            'currency': currency or GoogleShoppingImmersiveScraper._extract_currency(price, price_label),
        }

    @staticmethod
    def _extract_currency(*values: str | None) -> str | None:
        text = ' '.join(value for value in values if value)
        for symbol, currency in _CURRENCY_BY_SYMBOL.items():
            if symbol in text:
                return currency

        match = re.search(r'\b[A-Z]{3}\b', text)
        if match:
            return match.group(0)

        return None

    @staticmethod
    def _extract_old_price(card: BeautifulSoup) -> dict[str, str | None]:
        old_price_el = card.find(attrs={
            'aria-label': lambda value: value and str(value).startswith((
                'Old price was',
                'Maximum retail price:',
            )),
        })
        if not old_price_el:
            return {'old_price': None, 'old_price_label': None}

        return {
            'old_price': old_price_el.get_text(strip=True) or None,
            'old_price_label': old_price_el.get('aria-label'),
        }

    @staticmethod
    def _extract_offer_title(card: BeautifulSoup) -> str | None:
        title_el = card.select_one('.rYkzq.y1FcZd')
        if not title_el:
            return None
        return GoogleShoppingImmersiveScraper._clean_text(title_el.get_text(' ', strip=True))

    @staticmethod
    def _extract_offer_rating(card: BeautifulSoup) -> dict[str, str | float | None]:
        rating_el = card.find(attrs={
            'aria-label': lambda value: value and str(value).startswith('Rated ') and ' out of 5' in str(value),
        })
        if not rating_el:
            return {'offer_rating': None}

        rating_label = rating_el.get('aria-label')
        return {
            'offer_rating': GoogleShoppingImmersiveScraper._extract_rating(rating_label),
        }

    @staticmethod
    def _extract_offer_status(card: BeautifulSoup) -> str | None:
        status_el = card.select_one('.OaQPmf')
        if not status_el:
            return None
        return GoogleShoppingImmersiveScraper._clean_text(status_el.get_text(' ', strip=True))

    @staticmethod
    def _extract_offer_delivery(card: BeautifulSoup) -> str | None:
        delivery_el = card.find(attrs={
            'aria-label': lambda value: value and 'delivery' in str(value).lower(),
        })
        if not delivery_el:
            return None
        return (
            GoogleShoppingImmersiveScraper._clean_text(delivery_el.get('aria-label'))
            or GoogleShoppingImmersiveScraper._clean_text(delivery_el.get_text(' ', strip=True))
        )

    @staticmethod
    def _extract_sellers(soup: BeautifulSoup) -> list[dict[str, str | None]]:
        sellers = []
        seen: set[tuple[str | None, str | None, str | None]] = set()
        offers_grid = soup.find(attrs={'data-attrid': 'organic_offers_grid'})
        root = offers_grid or soup

        for el in root.find_all(attrs={'data-merchant-name': True}):
            card = el.find_parent(attrs={'role': 'listitem'}) or el.parent or el
            link_el = card.find('a', href=True)
            price = GoogleShoppingImmersiveScraper._extract_current_price(card)
            old_price = GoogleShoppingImmersiveScraper._extract_old_price(card)
            rating = GoogleShoppingImmersiveScraper._extract_offer_rating(card)
            seller = {
                'merchant': el.get('data-merchant-name'),
                'merchant_id': el.get('data-merchantid'),
                'offer_id': el.get('data-oid'),
                'title': GoogleShoppingImmersiveScraper._extract_offer_title(card),
                'price': price['price'],
                'currency': price['currency'],
                'old_price': old_price['old_price'],
                'target_url': el.get('data-target-url') or (link_el.get('href') if link_el else None),
                'status': GoogleShoppingImmersiveScraper._extract_offer_status(card),
                'delivery': GoogleShoppingImmersiveScraper._extract_offer_delivery(card),
                'offer_rating': rating['offer_rating'],
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
        rating_label = self._extract_rating_label(soup)
        buying_options = self._extract_sellers(soup)

        return {
            'input_url': self.url,
            'fetch_url': self.build_immersive_url(),
            'title': self._extract_title(soup),
            'rating': self._extract_rating(rating_label),
            'review_count': self._extract_review_count(rating_label),
            'features': self._extract_specs(soup),
            'buying_options': buying_options,
            'competing_products': self._extract_competing_products(soup),
        }
