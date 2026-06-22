from __future__ import annotations

from pathlib import Path


def build_sheet(images: list[Path], out_path: Path, columns: int) -> None:
    from PIL import Image

    loaded = [Image.open(p).convert('RGBA') for p in images]
    try:
        max_w = max(img.width for img in loaded)
        max_h = max(img.height for img in loaded)
        rows = (len(loaded) + columns - 1) // columns
        sheet = Image.new('RGBA', (max_w * columns, max_h * rows), (10, 10, 10, 255))

        for idx, img in enumerate(loaded):
            r = idx // columns
            c = idx % columns
            x = c * max_w
            y = r * max_h
            sheet.paste(img, (x, y))

        out_path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(out_path)
    finally:
        for img in loaded:
            try:
                img.close()
            except Exception:
                pass


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1] / 'public' / 'qa-screenshots-history' / 'service-flow-premium-full'
    names = [
        'reserva-confirmada',
        'operador-asignado',
        'en-camino',
        'operador-llego',
        'servicio-en-curso',
        'servicio-finalizado',
        'valoracion',
        'avisos',
    ]

    mobile = [base_dir / f'{n}_mobile.png' for n in names]
    desktop = [base_dir / f'{n}_desktop.png' for n in names]
    missing = [str(p) for p in mobile + desktop if not p.exists()]
    if missing:
        raise SystemExit('Missing screenshots:\n' + '\n'.join(missing))

    build_sheet(mobile, base_dir / 'contact_sheet_mobile.png', columns=2)
    build_sheet(desktop, base_dir / 'contact_sheet_desktop.png', columns=2)


if __name__ == '__main__':
    main()

