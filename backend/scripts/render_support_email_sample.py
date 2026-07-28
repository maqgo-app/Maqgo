import base64
import os
import sys
from html import escape
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _load_logo_data_uri() -> str:
    repo_root = BACKEND_DIR.parent
    candidates = [
        repo_root / "frontend" / "public" / "maqgo_logo_clean.png",
        repo_root / "frontend" / "src" / "assets" / "maqgo-logo.png",
        repo_root / "frontend" / "public" / "maqgo-logo-transparent.png",
    ]
    for path in candidates:
        if path.exists():
            encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
            return f"data:image/png;base64,{encoded}"
    return ""


def _build_support_email_html(*, logo_url: str) -> str:
    logo_html = (
        f'<img src="{escape(logo_url)}" alt="MAQGO" width="28" height="28" style="display:block;border:0;outline:none;text-decoration:none;">'
        if logo_url
        else '<div style="width:28px;height:28px;border-radius:999px;background:#ec6819;"></div>'
    )
    return f"""\
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Recibimos tu solicitud y ya está siendo revisada por soporte@maqgo.cl.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:22px 24px;background:#0b1220;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left">
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="padding-right:10px;">{logo_html}</td>
                          <td style="font-size:22px;font-weight:700;letter-spacing:0.3px;">MAQGO</td>
                        </tr>
                      </table>
                    </td>
                    <td align="right">
                      <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#1f2937;color:#e5e7eb;font-size:12px;">Soporte MAQGO</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 24px 12px 24px;">
                <div style="color:#ec6819;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Correo transaccional</div>
                <h1 style="margin:0 0 10px 0;font-size:28px;line-height:1.2;color:#111827;">Recibimos tu solicitud</h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
                  Hola Tomas, ya recibimos tu caso y nuestro equipo lo está revisando. Este correo sale desde
                  <strong>soporte@maqgo.cl</strong> y mantiene toda la continuidad de la conversación.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 16px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;">
                  <tr>
                    <td style="padding:18px 18px 16px 18px;">
                      <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">Resumen del caso</div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.7;color:#475569;">
                        <tr>
                          <td style="padding:0 0 4px 0;">Tipo</td>
                          <td align="right" style="padding:0 0 4px 0;color:#111827;font-weight:600;">Soporte operativo</td>
                        </tr>
                        <tr>
                          <td style="padding:0 0 4px 0;">Fecha</td>
                          <td align="right" style="padding:0 0 4px 0;color:#111827;font-weight:600;">26 de julio de 2026</td>
                        </tr>
                        <tr>
                          <td style="padding:0 0 4px 0;">ID de caso</td>
                          <td align="right" style="padding:0 0 4px 0;color:#111827;font-weight:600;">MQ-48291</td>
                        </tr>
                        <tr>
                          <td style="padding:0;">Estado</td>
                          <td align="right" style="padding:0;color:#111827;font-weight:600;">En revisión</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 12px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="50%" valign="top" style="padding-right:8px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;">
                        <tr>
                          <td style="padding:18px;">
                            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">Qué sigue ahora</div>
                            <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#475569;">
                              <li>Revisamos el caso para darte una respuesta clara y concreta.</li>
                              <li>Si falta información, te escribiremos desde este mismo correo.</li>
                              <li>La continuidad del caso queda centralizada en soporte@maqgo.cl.</li>
                            </ul>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td width="50%" valign="top" style="padding-left:8px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;">
                        <tr>
                          <td style="padding:18px;">
                            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">Canales de respuesta</div>
                            <div style="font-size:14px;line-height:1.7;color:#475569;">
                              Responde este mismo correo o escríbenos a
                              <a href="mailto:soporte@maqgo.cl" style="color:#ec6819;text-decoration:none;font-weight:700;">soporte@maqgo.cl</a>.
                            </div>
                            <div style="margin-top:16px;">
                              <a href="mailto:soporte@maqgo.cl" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600;font-size:14px;">
                                Responder a soporte
                              </a>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 24px 24px;border-top:1px solid #e5e7eb;">
                <div style="font-size:12px;line-height:1.6;color:#64748b;">
                  MAQGO<br>
                  Marketplace premium de maquinaria<br>
                  <a href="mailto:soporte@maqgo.cl" style="color:#ec6819;text-decoration:none;">soporte@maqgo.cl</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def main() -> None:
    out_dir = BACKEND_DIR / "qa-artifacts" / "support-email"
    out_dir.mkdir(parents=True, exist_ok=True)
    html = _build_support_email_html(logo_url=_load_logo_data_uri())
    html_path = out_dir / "support_email_sample.html"
    html_path.write_text(html, encoding="utf-8")
    print(f"Wrote: {html_path}")

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 1200, "height": 900}, device_scale_factor=2)
            page = context.new_page()
            page.set_content(html, wait_until="networkidle")
            page.wait_for_timeout(200)
            png_path = out_dir / "support_email_sample_2400.png"
            page.screenshot(path=str(png_path), full_page=True)
            print(f"Wrote: {png_path}")
            context.close()
            browser.close()
    except Exception as exc:
        print(f"Screenshot skipped: {exc}")


if __name__ == "__main__":
    main()
