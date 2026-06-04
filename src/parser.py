from __future__ import annotations

import re
import json
from bs4 import BeautifulSoup
import codecs

_CURRENCY_BY_SYMBOL = {
    '₹': 'INR',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
}

class GoogleShoppingImmersiveParser:
    @staticmethod
    def _clean_text(value: str | None) -> str | None:
        if not value:
            return None
        return re.sub(r'\s+', ' ', value).strip()

    @staticmethod
    def _extract_image_map(html: str) -> dict[str, str]:
        """Extracts image mappings from google.ldi and _setImagesSrc scripts."""
        image_map = {}
        
        # 1. Parse google.ldi (Main product images)
        ldi_match = re.search(r'google\.ldi\s*=\s*({.*?});', html, re.DOTALL)
        if ldi_match:
            try:
                image_map.update(json.loads(ldi_match.group(1)))
            except (json.JSONDecodeError, ValueError):
                pass
                
        # 2. Parse _setImagesSrc (Seller logos and favicons)
        script_pattern = re.compile(r"var\s+_u\s*=\s*'([^']+)'\s*;\s*var\s+_i\s*=\s*'([^']+)'\s*;\s*_setImagesSrc")
        for m in script_pattern.finditer(html):
            url = m.group(1)
            img_id = m.group(2)
            url = url.replace(r'\x3d', '=').replace(r'\x26', '&')
            image_map[img_id] = url
            
        return image_map

    @classmethod
    def _extract_main_image(cls, soup: BeautifulSoup, image_map: dict[str, str]) -> str | None:
        """Extracts the primary image for the product."""
        meta_img = soup.find('meta', property='og:image')
        if meta_img and meta_img.get('content'):
            return meta_img.get('content')
            
        for _, url in image_map.items():
            if url and url.startswith('http') and 'favicon' not in url:
                return url
        return None

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

    @classmethod
    def _extract_description(cls, soup: BeautifulSoup) -> str | None:
        """Extracts the product description text."""
        desc_container = soup.find(attrs={'data-attrid': 'product_description'})
        if not desc_container:
            return None
            
        text_el = desc_container.find(id='description_container')
        if not text_el:
            text_el = desc_container
            
        return cls._clean_text(text_el.get_text(' ', strip=True))

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

    @classmethod
    def _extract_specs(cls, soup: BeautifulSoup) -> dict[str, str]:
        specs = {}
        for el in soup.find_all(attrs={'data-attrid': 'product_attributes_facet'}):
            parts = el.get_text(separator=':', strip=True).split(':', 1)
            if len(parts) == 2:
                key = cls._clean_text(parts[0])
                value = cls._clean_text(parts[1])
                if key and value is not None:
                    specs[key] = value
        return specs
    
    @classmethod
    def _extract_injected_soup(cls, soup: BeautifulSoup) -> BeautifulSoup:
        """
        Extracts and parses deferred HTML payloads hidden inside script tags.
        Google hides secondary filters (like Capacity) and extra images here using hex escaping.
        """
        injected_html = ""
        for script in soup.find_all('script'):
            text = script.get_text()
            if 'jsl.dh(' in text:
                # Unescape Google's JavaScript HTML encoding so BeautifulSoup can read it
                clean_text = text.replace(r'\x3c', '<').replace(r'\x3e', '>').replace(r'\"', '"')
                injected_html += clean_text
                
        return BeautifulSoup(injected_html, 'html.parser')

    @classmethod
    def _extract_filters(cls, main_soup: BeautifulSoup, injected_soup: BeautifulSoup) -> list[dict]:
        """Extracts variant filters (e.g. Colour, Capacity) from both standard and injected DOMs."""
        filters = {}
        seen_pvfs = set()
        
        # Combine elements from both the visible HTML and the hidden JavaScript HTML
        elements = main_soup.find_all(attrs={'data-pvf': True}) + injected_soup.find_all(attrs={'data-pvf': True})
        
        for el in elements:
            pvf = el.get('data-pvf')
            
            # Prevent duplicate options if they appear in both DOMs
            if pvf in seen_pvfs:
                continue
            seen_pvfs.add(pvf)
            
            aria_label = el.get('aria-label', '')
            
            # Screen readers get a clean string like: "Capacity filter by 128 GB. Currently unselected."
            match = re.search(r'^(.+?)\s+filter\s+by\s+(.+?)\.', aria_label)
            
            if match:
                category = match.group(1).strip()
                option_name = match.group(2).strip()
            else:
                # Fallback if aria-label is missing: find the nearest heading
                prev_heading = el.find_previous(attrs={'role': 'heading'})
                category = "Unknown"
                if prev_heading:
                    heading_text = prev_heading.get_text(separator=':', strip=True)
                    category = heading_text.split(':')[0].strip()
                
                option_name = el.get('data-label') or cls._clean_text(el.get_text(' ', strip=True))

            is_selected = el.get('data-selected') == 'true' or 'Currently selected' in aria_label

            if category not in filters:
                filters[category] = []

            opt = {
                'name': option_name,
                'value': pvf,
                'selected': is_selected
            }

            # Capture swatch images if available (commonly used on colors)
            img_url = el.get('data-img')
            if img_url:
                opt['image'] = img_url

            filters[category].append(opt)

        return [{'category': k, 'options': v} for k, v in filters.items()]

    @classmethod
    def _extract_current_price(cls, card: BeautifulSoup) -> dict[str, str | None]:
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
            'currency': currency or cls._extract_currency(price, price_label),
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

    @classmethod
    def _extract_offer_title(cls, card: BeautifulSoup) -> str | None:
        title_el = card.select_one('.rYkzq.y1FcZd')
        if not title_el:
            return None
        return cls._clean_text(title_el.get_text(' ', strip=True))

    @classmethod
    def _extract_offer_rating(cls, card: BeautifulSoup) -> dict[str, str | float | None]:
        rating_el = card.find(attrs={
            'aria-label': lambda value: value and str(value).startswith('Rated ') and ' out of 5' in str(value),
        })
        if not rating_el:
            return {'offer_rating': None}

        rating_label = rating_el.get('aria-label')
        return {
            'offer_rating': cls._extract_rating(rating_label),
        }

    @classmethod
    def _extract_offer_status(cls, card: BeautifulSoup) -> str | None:
        status_el = card.select_one('.OaQPmf')
        if not status_el:
            return None
        return cls._clean_text(status_el.get_text(' ', strip=True))

    @classmethod
    def _extract_offer_delivery(cls, card: BeautifulSoup) -> str | None:
        delivery_el = card.find(attrs={
            'aria-label': lambda value: value and 'delivery' in str(value).lower(),
        })
        if not delivery_el:
            return None
        return (
            cls._clean_text(delivery_el.get('aria-label'))
            or cls._clean_text(delivery_el.get_text(' ', strip=True))
        )

    @classmethod
    def _extract_sellers(cls, soup: BeautifulSoup, image_map: dict[str, str]) -> list[dict[str, str | None]]:
        sellers = []
        seen: set[tuple[str | None, str | None, str | None]] = set()
        offers_grid = soup.find(attrs={'data-attrid': 'organic_offers_grid'})
        root = offers_grid or soup

        for el in root.find_all(attrs={'data-merchant-name': True}):
            card = el.find_parent(attrs={'role': 'listitem'}) or el.parent or el
            link_el = card.find('a', href=True)
            price = cls._extract_current_price(card)
            old_price = cls._extract_old_price(card)
            rating = cls._extract_offer_rating(card)
            
            seller_logo = None
            img_tag = card.find('img')
            if img_tag:
                img_id = img_tag.get('id')
                if img_id and img_id in image_map and image_map[img_id].startswith('http'):
                    seller_logo = image_map[img_id]
                else:
                    src = img_tag.get('src') or img_tag.get('data-src') or ''
                    if src.startswith('http') and 'data:image' not in src:
                        seller_logo = src

            seller = {
                'merchant': el.get('data-merchant-name'),
                'merchant_id': el.get('data-merchantid'),
                'offer_id': el.get('data-oid'),
                'title': cls._extract_offer_title(card),
                'price': price['price'],
                'currency': price['currency'],
                'old_price': old_price['old_price'],
                'target_url': el.get('data-target-url') or (link_el.get('href') if link_el else None),
                'status': cls._extract_offer_status(card),
                'delivery': cls._extract_offer_delivery(card),
                'offer_rating': rating['offer_rating'],
                'seller_logo': seller_logo,
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

    @classmethod
    def parse_product(cls, soup: BeautifulSoup, url: str, fetch_url: str, html: str | None = None) -> dict:
        raw_html = html or str(soup)
        image_map = cls._extract_image_map(raw_html)
        
        # Unpack the hidden Javascript HTML
        injected_soup = cls._extract_injected_soup(soup)
        
        rating_label = cls._extract_rating_label(soup)
        buying_options = cls._extract_sellers(soup, image_map)

        return {
            'input_url': url,
            'fetch_url': fetch_url,
            'title': cls._extract_title(soup),
            'description': cls._extract_description(soup),
            'main_image': cls._extract_main_image(soup, image_map),
            'rating': cls._extract_rating(rating_label),
            'review_count': cls._extract_review_count(rating_label),
            'features': cls._extract_specs(soup),
            # Pass BOTH soups into the filter extractor
            'filters': cls._extract_filters(soup, injected_soup), 
            'buying_options': buying_options,
            'competing_products': cls._extract_competing_products(soup),
        }