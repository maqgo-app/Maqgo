from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

import httpx
from xml.etree import ElementTree


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(s: str) -> str:
    h = hashlib.sha256()
    h.update((s or "").encode("utf-8"))
    return h.hexdigest()


def _norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_CHILE_RE = re.compile(r"(?:\+56\s*)?(?:\(?9\)?\s*)?(\d\s*\d\s*\d\s*\d\s*\d\s*\d\s*\d\s*\d)")
HREF_RE = re.compile(r"href\s*=\s*['\"]([^'\"]+)['\"]", re.IGNORECASE)


def extract_emails(text: str) -> list[str]:
    raw = EMAIL_RE.findall(text or "")
    out: list[str] = []
    seen = set()
    for e in raw:
        t = (e or "").strip().lower()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def _normalize_chile_mobile(phone_text: str) -> Optional[str]:
    t = re.sub(r"[^0-9]", "", phone_text or "")
    if not t:
        return None
    if t.startswith("56") and len(t) >= 11:
        t = t[2:]
    if len(t) == 9 and t.startswith("9"):
        return "+56" + t
    if len(t) == 8:
        return "+569" + t
    if len(t) == 11 and t.startswith("569"):
        return "+" + t
    return None


def extract_chile_mobiles(text: str) -> list[str]:
    out: list[str] = []
    seen = set()
    for m in PHONE_CHILE_RE.findall(text or ""):
        n = _normalize_chile_mobile(m)
        if not n or n in seen:
            continue
        seen.add(n)
        out.append(n)
    return out


def extract_contact_links(html: str) -> list[str]:
    out: list[str] = []
    seen = set()
    for href in HREF_RE.findall(html or ""):
        h = (href or "").strip()
        if not h or h.startswith("mailto:") or h.startswith("tel:"):
            continue
        low = h.lower()
        if any(k in low for k in ("contact", "contacto", "cotiza", "cotizacion", "cotización", "form")):
            if h in seen:
                continue
            seen.add(h)
            out.append(h)
    return out


def parse_rss(xml_text: str) -> list[dict[str, str]]:
    try:
        root = ElementTree.fromstring(xml_text or "")
    except Exception:
        return []

    items: list[dict[str, str]] = []
    for item in root.findall(".//item"):
        title = "".join((item.findtext("title") or "").strip())
        link = "".join((item.findtext("link") or "").strip())
        if not title and not link:
            continue
        items.append({"title": _norm_ws(title), "link": link})
    return items


@dataclass
class DiscoverySource:
    id: str
    url: str
    kind: str
    source_type: str
    node_id: Optional[str]
    category: str
    enabled: bool
    max_items: int


def load_sources_from_config(config: dict[str, Any]) -> list[DiscoverySource]:
    raw = config.get("discovery_sources") if isinstance(config, dict) else None
    if not isinstance(raw, list):
        return []

    out: list[DiscoverySource] = []
    for s in raw:
        if not isinstance(s, dict):
            continue
        enabled = bool(s.get("enabled", True))
        sid = str(s.get("id") or "").strip()
        url = str(s.get("url") or "").strip()
        if not sid or not url:
            continue
        kind = str(s.get("kind") or "supply").strip().lower()
        st = str(s.get("type") or "rss").strip().lower()
        node_id = str(s.get("node_id") or "").strip() or None
        category = str(s.get("category") or "").strip()
        try:
            max_items = int(s.get("max_items") or 25)
        except Exception:
            max_items = 25
        max_items = max(1, min(200, max_items))
        out.append(
            DiscoverySource(
                id=sid,
                url=url,
                kind=kind,
                source_type=st,
                node_id=node_id,
                category=category,
                enabled=enabled,
                max_items=max_items,
            )
        )
    return out


def _host(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


def discovery_dedupe_key(*, source_id: str, link: str, email: str, phone: str, title: str) -> str:
    base = "|".join(
        [
            (source_id or "").strip().lower(),
            (link or "").strip(),
            (email or "").strip().lower(),
            (phone or "").strip(),
            _norm_ws(title or "").lower(),
        ]
    )
    return _sha256(base)


async def _fetch(client: httpx.AsyncClient, url: str) -> str:
    r = await client.get(url, follow_redirects=True)
    r.raise_for_status()
    return r.text


async def run_discovery_once(*, db, config: dict[str, Any]) -> dict[str, Any]:
    sources = [s for s in load_sources_from_config(config) if s.enabled]
    if not sources:
        return {"ok": True, "sources": 0, "items_created": 0, "run_id": None}

    run_id = _sha256(_now_iso())
    now = _now_iso()
    created = 0
    errors: list[dict[str, str]] = []
    fetched = 0

    timeout = httpx.Timeout(12.0, connect=10.0)
    headers = {"User-Agent": "MAQGO-GrowthAI/1.0"}
    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        for src in sources:
            try:
                if src.source_type == "rss":
                    xml = await _fetch(client, src.url)
                    fetched += 1
                    items = parse_rss(xml)[: src.max_items]
                    for it in items:
                        title = it.get("title") or ""
                        link = it.get("link") or ""
                        dk = discovery_dedupe_key(source_id=src.id, link=link, email="", phone="", title=title)
                        doc = {
                            "id": dk,
                            "dedupe_key": dk,
                            "status": "new",
                            "kind": src.kind,
                            "source": src.id,
                            "source_type": src.source_type,
                            "source_url": src.url,
                            "host": _host(link or src.url),
                            "node_id": src.node_id,
                            "category": src.category,
                            "title": title,
                            "detail": "",
                            "link": link,
                            "contact": {},
                            "meta": {"run_id": run_id},
                            "createdAt": now,
                            "updatedAt": now,
                        }
                        try:
                            await db.growth_opportunity_items.insert_one(doc)
                            created += 1
                        except Exception:
                            pass
                elif src.source_type == "html":
                    html = await _fetch(client, src.url)
                    fetched += 1
                    emails = extract_emails(html)
                    phones = extract_chile_mobiles(html)
                    links = extract_contact_links(html)
                    title = f"Sitio detectado: {src.url}"
                    dk = discovery_dedupe_key(
                        source_id=src.id,
                        link=src.url,
                        email=(emails[0] if emails else ""),
                        phone=(phones[0] if phones else ""),
                        title=title,
                    )
                    doc = {
                        "id": dk,
                        "dedupe_key": dk,
                        "status": "new",
                        "kind": src.kind,
                        "source": src.id,
                        "source_type": src.source_type,
                        "source_url": src.url,
                        "host": _host(src.url),
                        "node_id": src.node_id,
                        "category": src.category,
                        "title": title,
                        "detail": "",
                        "link": src.url,
                        "contact": {
                            "emails": emails,
                            "phones": phones,
                            "contact_links": links,
                        },
                        "meta": {"run_id": run_id},
                        "createdAt": now,
                        "updatedAt": now,
                    }
                    try:
                        await db.growth_opportunity_items.insert_one(doc)
                        created += 1
                    except Exception:
                        pass
                else:
                    errors.append({"source": src.id, "error": f"unsupported_type:{src.source_type}"})
            except Exception as e:
                errors.append({"source": src.id, "error": str(e)[:300]})

    await db.growth_discovery_runs.insert_one(
        {
            "id": run_id,
            "status": "completed",
            "sources": len(sources),
            "fetched": fetched,
            "items_created": created,
            "errors": errors,
            "at": now,
        }
    )
    return {"ok": True, "run_id": run_id, "sources": len(sources), "fetched": fetched, "items_created": created, "errors": errors}

