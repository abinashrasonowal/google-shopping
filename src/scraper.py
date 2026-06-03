from __future__ import annotations

import re
from urllib.parse import urlencode
from bs4 import BeautifulSoup

from src.client.http_client import HttpClient

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

    def _build_product_url(
        self,
        headline_offer_docid: str,
        image_docid: str,
        rds: str | None,
        *,
        pid: str | None = None,
        catalogid: str | None = None,
        gpcid: str | None = None,
    ) -> str:
        prds_parts = [
            f"headlineOfferDocid:{headline_offer_docid}",
            f"imageDocid:{image_docid}",
        ]
        if catalogid:
            prds_parts += [f"catalogid:{catalogid}", f"gpcid:{gpcid}"]
        if pid:
            prds_parts += [f"productid:{pid}", "pvo:25"]
        if rds:
            prds_parts.append(f"rds:{rds}")
        prds_parts.append("pvt:hg")

        params: dict[str, str] = {
            "ibp": "oshop",
            "q": self.query,
            "prds": ",".join(prds_parts),
            "hl": "en",
            "gl": self.country,
            "udm": "28",
        }
        if pid:
            params["pvorigin"] = "25"
        return f"{_OSHOP_BASE_URL}?{urlencode(params)}"

    @staticmethod
    def _extract_rating(card: BeautifulSoup) -> float | None:
        el = card.select_one('[role="img"][aria-label*="Rated"]')
        if not el:
            return None
        match = re.search(r'Rated\s+([\d.]+)', el.get('aria-label', ''))    
        return float(match.group(1)) if match else None

    @staticmethod
    def _extract_review_count(card: BeautifulSoup) -> int | None:
        el = card.select_one('[role="img"][aria-label*="Rated"]')
        if not el:
            return None
        match = re.search(r'([\d,]+\.?\d*[kK]?)\s+(?:user\s+)?reviews?', el.get('aria-label', ''))
        if not match:
            return None
        raw = match.group(1).replace(',', '')
        if raw[-1].lower() == 'k':
            return int(float(raw[:-1]) * 1000)
        return int(float(raw))

    def parse_products(self, soup: BeautifulSoup) -> list[dict]:
        products = []

        for card in soup.select('.Ez5pwe'):
            container = card.select_one('[data-cid]')
            if not container:
                continue

            catalogid = container.get('data-cid')
            gpcid = container.get('data-gid')
            headline_offer_docid = container.get('data-oid')
            image_docid = container.get('data-iid')
            pid = container.get('data-pid')
            rds = container.get('data-rds')

            if not rds and gpcid:
                rds = f"PC_{gpcid}|PROD_PC_{gpcid}"

            if all([catalogid, gpcid, headline_offer_docid, image_docid]):
                link = self._build_product_url(headline_offer_docid, image_docid, rds, catalogid=catalogid, gpcid=gpcid)
            elif all([pid, headline_offer_docid, image_docid]):
                link = self._build_product_url(headline_offer_docid, image_docid, rds, pid=pid)
            else:
                link = "N/A"

            title_el = card.select_one('.gkQHve')
            price_el = card.select_one('.lmQWe')
            source_el = card.select_one('.WJMUdc')

            products.append({
                'title': title_el.get_text(strip=True) if title_el else None,
                'url': link,
                'price': price_el.get_text(strip=True) if price_el else None,
                'rating': self._extract_rating(card),
                'review_count': self._extract_review_count(card),
                'source': source_el.get_text(strip=True) if source_el else None
            })

        return products