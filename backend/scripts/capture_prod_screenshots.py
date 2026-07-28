import os
import re
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright


def now_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def safe_name(raw: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", raw.strip())
    return cleaned.strip("_") or "page"


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]

    base_url = (os.getenv("PROD_BASE_URL") or "https://www.maqgo.cl").strip().rstrip("/")
    if not base_url.startswith("https://"):
        raise RuntimeError("PROD_BASE_URL must start with https://")

    run_id = now_id() + "_prod_screenshots"
    out_dir = repo_root / "backend/qa-artifacts/e2e-prod-screenshots" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    urls = [
        base_url + "/",
    ]

    extra = (os.getenv("PROD_SCREENSHOT_URLS") or "").strip()
    if extra:
        for part in extra.split(","):
            u = part.strip()
            if not u:
                continue
            urls.append(u)

    headless = str(os.getenv("PROD_SCREENSHOT_HEADLESS", "true")).strip().lower() in {"1", "true", "yes", "on"}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            locale="es-CL",
        )
        page = context.new_page()

        manifest = {"run_id": run_id, "base_url": base_url, "pages": []}

        for i, url in enumerate(urls, start=1):
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(1500)
                title = page.title() or ""
                slug = safe_name(f"{i:02d}_{title}" if title else f"{i:02d}_{url}")
                png_path = out_dir / f"{slug}.png"
                page.screenshot(path=str(png_path), full_page=True)
                manifest["pages"].append({"url": url, "title": title, "screenshot": png_path.name})
            except Exception as e:
                manifest["pages"].append({"url": url, "error": type(e).__name__})

        (out_dir / "manifest.json").write_text(
            __import__("json").dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        context.close()
        browser.close()

    print(f"RUN_ID={run_id}")
    print(f"OUT_DIR={out_dir}")


if __name__ == "__main__":
    main()

