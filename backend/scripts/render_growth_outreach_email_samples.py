import os
import sys
import base64
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from services.growth_ai_contact_executor import _email_html  # noqa: E402


def _load_logo_data_uri() -> str:
    repo_root = BACKEND_DIR.parent
    candidates = [
        repo_root / "frontend" / "public" / "maqgo_logo_clean.svg",
        repo_root / "frontend" / "public" / "maqgo_logo_clean.png",
        repo_root / "frontend" / "public" / "maqgo-logo-transparent.png",
    ]
    for p in candidates:
        if p.exists():
            b = p.read_bytes()
            enc = base64.b64encode(b).decode("utf-8")
            if p.suffix.lower() == ".svg":
                return f"data:image/svg+xml;base64,{enc}"
            return f"data:image/png;base64,{enc}"
    return ""


def main() -> None:
    out_dir = BACKEND_DIR / "qa-artifacts" / "growth-ai"
    out_dir.mkdir(parents=True, exist_ok=True)

    for p in out_dir.glob("outreach_*.html"):
        try:
            p.unlink()
        except Exception:
            pass
    for p in out_dir.glob("outreach_*.png"):
        try:
            p.unlink()
        except Exception:
            pass

    os.environ.setdefault("MAQGO_PUBLIC_URL", "https://www.maqgo.cl")
    logo_uri = _load_logo_data_uri()
    if logo_uri:
        os.environ["MAQGO_EMAIL_LOGO_URL"] = logo_uri

    samples = [
        {
            "name": "provider_owner",
            "subject": "MAQGO — Activa tu perfil y recibe solicitudes",
            "message": (
                "Hola Diego, soy del equipo MAQGO.\n"
                "Para Administración: estamos sumando proveedores de retroexcavadoras en Lampa (RM).\n\n"
                "Recibe solicitudes para obras y proyectos (mismo día o programado) y con seguimiento en línea.\n"
                "Inicio hoy puede pagar bonificación adicional (hasta +20%).\n\n"
                "Haz clic en Iniciar onboarding para activar tu perfil.\n"
                "Si prefieres, responde con: comuna(s) que cubres + máquinas + disponibilidad."
            ),
        },
        {
            "name": "provider_manager",
            "subject": "MAQGO — Activa tu perfil y recibe solicitudes",
            "message": (
                "Hola Fernanda, soy del equipo MAQGO.\n"
                "Para Gerencia: estamos sumando proveedores de excavadoras en Lampa (RM).\n\n"
                "Cobertura por zona y unidades, con seguimiento del servicio en línea y trabajos (mismo día o programados).\n\n"
                "Haz clic en Iniciar onboarding para activar tu perfil.\n"
                "Si prefieres, responde con: comuna(s) que cubres + máquinas + disponibilidad."
            ),
        },
        {
            "name": "client_owner",
            "subject": "MAQGO — Cotiza maquinaria en tiempo real",
            "message": (
                "Hola, soy del equipo MAQGO.\n"
                "Para Administración: si necesitas retroexcavadora en Lampa (RM).\n\n"
                "Cotiza y reserva en tiempo real, incluso para el mismo día (según disponibilidad), con seguimiento en línea.\n"
                "Aplica para obras, faenas y proyectos de cualquier tamaño (empresas y organizaciones).\n\n"
                "Haz clic en Cotizar ahora o responde con: ubicación + fecha/hora + tipo de trabajo (1 línea)."
            ),
        },
        {
            "name": "client_ops",
            "subject": "MAQGO — Cotiza maquinaria en tiempo real",
            "message": (
                "Hola, soy del equipo MAQGO.\n"
                "Para Operaciones: si necesitas camión tolva en Santiago.\n\n"
                "Cotiza y reserva en tiempo real, incluso para el mismo día (según disponibilidad), con seguimiento en línea.\n"
                "Aplica para obras, faenas y proyectos de cualquier tamaño (empresas y organizaciones).\n\n"
                "Haz clic en Cotizar ahora o responde con: ubicación + fecha/hora + tipo de trabajo (1 línea)."
            ),
        },
        {
            "name": "client_procurement",
            "subject": "MAQGO — Cotiza maquinaria en tiempo real",
            "message": (
                "Hola, soy del equipo MAQGO.\n"
                "Para Compras: si necesitas motoniveladora en terreno.\n\n"
                "Cotiza y reserva en tiempo real, incluso para el mismo día (según disponibilidad), con seguimiento en línea.\n"
                "Aplica para obras, faenas y proyectos de cualquier tamaño (empresas y organizaciones).\n\n"
                "Haz clic en Cotizar ahora o responde con: ubicación + fecha/hora + tipo de trabajo (1 línea)."
            ),
        },
        {
            "name": "client_site",
            "subject": "MAQGO — Cotiza maquinaria en tiempo real",
            "message": (
                "Hola, soy del equipo MAQGO.\n"
                "Para Jefatura de obra: si necesitas excavadora en obra.\n\n"
                "Cotiza y reserva en tiempo real, incluso para el mismo día (según disponibilidad), con seguimiento en línea.\n"
                "Aplica para obras, faenas y proyectos de cualquier tamaño (empresas y organizaciones).\n\n"
                "Haz clic en Cotizar ahora o responde con: ubicación + fecha/hora + tipo de trabajo (1 línea)."
            ),
        },
    ]

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 920, "height": 900}, device_scale_factor=2)
            page = context.new_page()
            for s in samples:
                html = _email_html(s["subject"], s["message"])
                (out_dir / f"outreach_{s['name']}.html").write_text(html, encoding="utf-8")
                page.set_content(html, wait_until="networkidle")
                page.wait_for_timeout(200)
                page.screenshot(path=str(out_dir / f"outreach_{s['name']}.png"), full_page=True)
            context.close()
            browser.close()
    except Exception as e:
        for s in samples:
            html = _email_html(s["subject"], s["message"])
            (out_dir / f"outreach_{s['name']}.html").write_text(html, encoding="utf-8")
        raise e


if __name__ == "__main__":
    main()
