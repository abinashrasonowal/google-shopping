from __future__ import annotations

from typing import Any

import aiohttp

from .http_client import HttpClient


class LocalHttpClient(HttpClient):
    def __init__(self, headers: dict[str, str] | None = None) -> None:
        self.headers = headers or {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/124.0.0.0 Safari/537.36'
            ),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }

    async def fetch(self, url: str, **kwargs: Any) -> str:
        async with aiohttp.ClientSession(headers=self.headers) as session:
            async with session.get(url, ssl=False, **kwargs) as response:
                return await response.text()
