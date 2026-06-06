from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

from .http_client import HttpClient

log = logging.getLogger(__name__)

_MAX_RETRIES = 3
_RETRY_BACKOFF_BASE = 1.0  # seconds; doubles each attempt


class ProxyHttpClient(HttpClient):
    def __init__(self, proxy_url: str, headers: dict[str, str] | None = None) -> None:
        self.proxy_url = proxy_url
        self.headers = headers or {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/137.0.0.0 Safari/537.36'
            ),
            'Accept': (
                'text/html,application/xhtml+xml,application/xml;q=0.9,'
                'image/avif,image/webp,image/apng,*/*;q=0.8'
            ),
            'Accept-Language': 'en-IN,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Priority': 'u=0, i',
            'Sec-Ch-Ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        }

    async def fetch(self, url: str, **kwargs: Any) -> tuple[str, str]:
        last_exc: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with aiohttp.ClientSession(headers=self.headers) as session:
                    async with session.get(
                        url,
                        proxy=self.proxy_url,
                        ssl=False,
                        timeout=aiohttp.ClientTimeout(total=30),
                        **kwargs,
                    ) as response:
                        response.raise_for_status()
                        return await response.text(), str(response.url)
            except (aiohttp.ClientHttpProxyError, aiohttp.ClientResponseError) as exc:
                last_exc = exc
                if attempt < _MAX_RETRIES:
                    delay = _RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    log.warning(
                        'Proxy/HTTP error on attempt %d/%d (%s). Retrying in %.0fs...',
                        attempt, _MAX_RETRIES, exc, delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    log.error('All %d attempts failed. Last error: %s', _MAX_RETRIES, exc)
        raise last_exc  # type: ignore[misc]
