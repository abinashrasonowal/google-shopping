from __future__ import annotations

from apify import Actor


async def get_proxy_url(groups: list[str] | None = None, country_code: str | None = None) -> str:
    proxy_configuration = await Actor.create_proxy_configuration(groups=groups, country_code=country_code)
    return await proxy_configuration.new_url()
