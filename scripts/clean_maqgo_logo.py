#!/usr/bin/env python3
"""
Limpia el logo MAQGO:
1. Elimina fondo negro → transparencia real
2. Mantiene colores, icono (engranaje+pin), texto MAQGO
3. Exporta PNG transparente alta resolución
"""

from pathlib import Path
from PIL import Image
import numpy as np

# Rutas
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
SRC_LOGO = PROJECT_ROOT / "frontend" / "src" / "assets" / "maqgo-logo.png"
OUTPUT_DIR = PROJECT_ROOT / "frontend" / "public"
OUTPUT_PNG = OUTPUT_DIR / "maqgo_logo_clean.png"
OUTPUT_SVG = OUTPUT_DIR / "maqgo_logo_clean.svg"

def remove_black_background(img: Image.Image, threshold: int = 30) -> Image.Image:
    """Convierte píxeles negros/casi negros a transparentes."""
    img = img.convert("RGBA")
    data = np.array(img)
    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]
    # Máscara: negro o muy oscuro → transparente
    black_mask = (r <= threshold) & (g <= threshold) & (b <= threshold)
    data[:, :, 3] = np.where(black_mask, 0, a)
    return Image.fromarray(data)

def main():
    if not SRC_LOGO.exists():
        print(f"Error: No se encuentra {SRC_LOGO}")
        return 1

    img = Image.open(SRC_LOGO)
    # Mantener resolución original (o escalar si es pequeña)
    w, h = img.size
    if w < 512:
        img = img.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
    cleaned = remove_black_background(img)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cleaned.save(OUTPUT_PNG, "PNG", optimize=True)
    print(f"✓ PNG guardado: {OUTPUT_PNG}")

    # SVG: embed PNG como imagen (preserva exactitud, sin reinterpretar)
    import base64
    from io import BytesIO
    buf = BytesIO()
    cleaned.save(buf, "PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{cleaned.width}" height="{cleaned.height}" viewBox="0 0 {cleaned.width} {cleaned.height}">
  <image width="{cleaned.width}" height="{cleaned.height}" 
         xlink:href="data:image/png;base64,{b64}"/>
</svg>'''
    OUTPUT_SVG.write_text(svg_content, encoding="utf-8")
    print(f"✓ SVG guardado: {OUTPUT_SVG}")
    return 0

if __name__ == "__main__":
    exit(main())
