from __future__ import annotations

import json
import re
from urllib.parse import urlencode

from bs4 import BeautifulSoup
import codecs


_OSHOP_BASE_URL = "https://www.google.com/search"


class GoogleShoppingParser:
    _IMAGE_SRC_FUNC_PATTERN = re.compile(
        r"_setImagesSrc\(\s*([\['\"].*?[\]'\"])\s*,\s*s\s*\)",
        re.DOTALL,
    )
    _IMAGE_SRC_ARRAY_PATTERN = re.compile(r"var\s+ii\s*=\s*(\[.*?\])\s*;")
    _IMAGE_SRC_DATA_PATTERN = re.compile(r"var\s+s\s*=\s*'(data:image/[^']+)'\s*;")
    _TBN_PATTERN = re.compile(
        r"https://encrypted-tbn\d+\.gstatic\.com/shopping\?[^\"'\\\s]+"
    )

    def __init__(self, query: str, country: str) -> None:
        self.query = query
        self.country = country

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

    def _extract_ldi_map(self, html: str) -> dict[str, str]:
        """Extracts the google.ldi JSON dictionary containing the real HTTP URLs."""
        match = re.search(r'google\.ldi\s*=\s*({.*?});', html, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except (json.JSONDecodeError, ValueError):
                pass
        return {}

    def _extract_injected_html(self, html: str) -> BeautifulSoup:
        """
        Extracts and parses all deferred HTML payloads hidden inside jsl.dh() script blocks.
        This is where Google hides the real URLs for the top products.
        """
        injected_html = ""
        # Regex to safely match JS string literals even if they contain escaped quotes (\")
        pattern = r'jsl\.dh\([^,]+,\s*"((?:[^"\\]|\\.)*)"\s*\);'

        for match in re.finditer(pattern, html):
            raw_payload = match.group(1)
            try:
                # Unescape \x3c to <, \" to ", etc. so BeautifulSoup can read it
                injected_html += codecs.decode(raw_payload, 'unicode_escape')
            except Exception:
                continue

        return BeautifulSoup(injected_html, 'html.parser')

    def _find_image_in_card(self, card: BeautifulSoup, ldi_map: dict[str, str]) -> str | None:
        """Looks for a valid HTTP image inside a specific card."""
        # 1. Check for direct data-src or src containing a valid URL
        for img in card.select('img'):
            src = img.get('src', '')
            data_src = img.get('data-src', '')

            if src.startswith('http') and 'encrypted-tbn' in src and 'favicon' not in src:
                return src
            if data_src.startswith('http') and 'encrypted-tbn' in data_src and 'favicon' not in data_src:
                return data_src

        # 2. Check if the image ID is mapped in google.ldi
        img_tag = card.select_one('img[id^="dimg_"]')
        if img_tag:
            img_id = img_tag.get('id')
            if img_id in ldi_map and ldi_map[img_id].startswith('http'):
                return ldi_map[img_id]

        return None

    def parse_products(self, soup: BeautifulSoup, html: str | None = None) -> list[dict]:
        raw_html = html or str(soup)
        ldi_map = self._extract_ldi_map(raw_html)
        injected_soup = self._extract_injected_html(raw_html)

        # Pre-build a fallback map from the hidden injected HTML (pid or title -> image URL)
        injected_images = {}
        for card in injected_soup.select('[data-pid], .MUWJ8c, g-inner-card'):
            pid = card.get('data-pid')
            title_el = card.select_one('.gkQHve')
            title = title_el.get_text(strip=True) if title_el else None

            img_url = self._find_image_in_card(card, ldi_map)
            if img_url:
                if pid:
                    injected_images[pid] = img_url
                if title:
                    injected_images[title] = img_url

        products = []

        # Track the position using enumerate, starting at 1
        for position, card in enumerate(soup.select('.Ez5pwe'), start=1):
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
                link = self._build_product_url(
                    headline_offer_docid, image_docid, rds,
                    catalogid=catalogid, gpcid=gpcid,
                )
            elif all([pid, headline_offer_docid, image_docid]):
                link = self._build_product_url(
                    headline_offer_docid, image_docid, rds,
                    pid=pid,
                )
            else:
                link = "N/A"

            title_el = card.select_one('.gkQHve')
            title = title_el.get_text(strip=True) if title_el else None

            price_el = card.select_one('.lmQWe')
            source_el = card.select_one('.WJMUdc')

            # Attempt 1: Get standard HTTP image from the main card DOM
            image_url = self._find_image_in_card(card, ldi_map)

            # Attempt 2: Fallback to the hidden HTML map using the Product ID or Title
            if not image_url:
                image_url = injected_images.get(pid) or injected_images.get(title)

            products.append({
                'position': position,
                'title': title,
                'url': link,
                'price': price_el.get_text(strip=True) if price_el else None,
                'rating': self._extract_rating(card),
                'review_count': self._extract_review_count(card),
                'source': source_el.get_text(strip=True) if source_el else None,
                'image': image_url,
            })

        return products
