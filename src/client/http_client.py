from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class HttpClient(ABC):
    @abstractmethod
    async def fetch(self, url: str, **kwargs: Any) -> str:
        ...
