import json
import os
import re
import sys
import time
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

    login_url = (os.getenv("PROD_LOGIN_URL") or (base_url + "/")).strip()
    if not login_url.startswith("https://"):
        raise RuntimeError("PROD_LOGIN_URL must start with https://")

    wait_seconds = int(os.getenv("PROD_LOGIN_WAIT_SECONDS") or "180")
    headless = str(os.getenv("PROD_SCREENSHOT_HEADLESS", "false")).strip().lower() in {"1", "true", "yes", "on"}

    interactive = str(os.getenv("PROD_INTERACTIVE_CAPTURE", "true")).strip().lower() in {"1", "true", "yes", "on"}

    urls_raw = (os.getenv("PROD_AUTH_SCREENSHOT_URLS") or "").strip()
    urls: list[str] = []
    if urls_raw:
        for part in urls_raw.split(","):
            u = part.strip()
            if u:
                urls.append(u)
    if not urls:
        urls = [
            base_url + "/",
        ]

    run_id = now_id() + "_prod_auth_screenshots"
    out_dir = repo_root / "backend/qa-artifacts/e2e-prod-screenshots" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "run_id": run_id,
        "base_url": base_url,
        "login_url": login_url,
        "login_wait_seconds": wait_seconds,
        "pages": [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            locale="es-CL",
        )
        page = context.new_page()

        page.goto(login_url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(out_dir / "00_before_login.png"), full_page=True)

        if wait_seconds > 0:
            time.sleep(wait_seconds)

        page.wait_for_timeout(1000)
        page.screenshot(path=str(out_dir / "01_after_login.png"), full_page=True)

        if interactive:
            idx = 1
            while True:
                sys.stdout.write("Etiqueta screenshot (ENTER para capturar, 'q' para salir): ")
                sys.stdout.flush()
                label = sys.stdin.readline()
                if label is None:
                    break
                label = label.strip()
                if label.lower() in {"q", "quit", "exit"}:
                    break
                if not label:
                    label = f"step_{idx:02d}"
                title = page.title() or ""
                slug = safe_name(f"{idx:02d}_{label}_{title}" if title else f"{idx:02d}_{label}")
                png_path = out_dir / f"{slug}.png"
                page.screenshot(path=str(png_path), full_page=True)
                manifest["pages"].append({"url": page.url, "title": title, "screenshot": png_path.name, "label": label})
                (out_dir / "manifest.json").write_text(
                    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                idx += 1
        else:
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

        (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        context.close()
        browser.close()

    print(f"RUN_ID={run_id}")
    print(f"OUT_DIR={out_dir}")


if __name__ == "__main__":
    main()
