#!/usr/bin/env python3
"""
Normaliza GIFs en game/data/images/creature a un lienzo cuadrado fijo y contenido
opaco centrado (mismo patrón visual para Phaser sin lógica especial en runtime).

Uso:
  python scripts/normalize_creature_gifs.py
  python scripts/normalize_creature_gifs.py --dry-run
  python scripts/normalize_creature_gifs.py --limit 20
"""

from __future__ import annotations

import argparse
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageSequence, ImageFile

# Evita truncar GIFs muy grandes al leer
ImageFile.LOAD_TRUNCATED_IMAGES = True


def union_alpha_bbox(frames: list[Image.Image]) -> tuple[int, int, int, int] | None:
    """Bounding box (l, t, r, b) unión de píxeles no transparentes en todos los fotogramas."""
    u: tuple[int, int, int, int] | None = None
    for fr in frames:
        a = fr.split()[3]
        b = a.getbbox()
        if b is None:
            continue
        if u is None:
            u = b
        else:
            u = (min(u[0], b[0]), min(u[1], b[1]), max(u[2], b[2]), max(u[3], b[3]))
    return u


def load_frames(path: Path) -> tuple[list[Image.Image], list[int]]:
    im = Image.open(path)
    frames: list[Image.Image] = []
    durs: list[int] = []
    base_dur = im.info.get("duration") or 100
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert("RGBA"))
        d = fr.info.get("duration") or base_dur
        if not d:
            d = 100
        durs.append(int(d))
    if not durs:
        durs = [100]
    return frames, durs


def normalize_frames(
    frames: list[Image.Image],
    canvas: int,
    margin: int,
) -> list[Image.Image]:
    """Recorta al bbox unión, escala para caber en (canvas-2*margin), centra en RGBA transparente."""
    inner = max(1, canvas - 2 * margin)
    bbox = union_alpha_bbox(frames)
    if bbox is None:
        # Sin opacidad detectada: escalar el fotograma entero para caber en inner
        out: list[Image.Image] = []
        for fr in frames:
            w, h = fr.size
            scale = min(inner / max(1, w), inner / max(1, h))
            nw = max(1, int(round(w * scale)))
            nh = max(1, int(round(h * scale)))
            s = fr.resize((nw, nh), Image.Resampling.NEAREST)
            c = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
            c.paste(s, ((canvas - nw) // 2, (canvas - nh) // 2), s)
            out.append(c)
        return out

    l, t, r, b = bbox
    cw = max(1, r - l)
    ch = max(1, b - t)
    scale = min(inner / cw, inner / ch)
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))

    ox0 = (canvas - nw) // 2
    oy0 = (canvas - nh) // 2

    result: list[Image.Image] = []
    for fr in frames:
        crop = fr.crop((l, t, r, b))
        resized = crop.resize((nw, nh), Image.Resampling.NEAREST)
        canvas_img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        canvas_img.paste(resized, (ox0, oy0), resized)
        result.append(canvas_img)
    return result


def save_gif(path: Path, frames: list[Image.Image], durations: list[int]) -> None:
    if len(frames) == 1:
        frames[0].save(path, save_all=False)
        return
    d = durations[: len(frames)]
    while len(d) < len(frames):
        d.append(d[-1] if d else 100)
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=d[: len(frames)],
        loop=0,
        disposal=2,
        optimize=False,
    )


def process_file(
    path_str: str,
    canvas: int,
    margin: int,
) -> tuple[str, bool, str]:
    path = Path(path_str)
    try:
        frames, durs = load_frames(path)
        if not frames:
            return (path.name, False, "sin fotogramas")
        norm = normalize_frames(frames, canvas, margin)
        tmp = path.with_suffix(path.suffix + ".tmp.gif")
        save_gif(tmp, norm, durs)
        tmp.replace(path)
        return (path.name, True, "")
    except Exception as e:  # noqa: BLE001
        return (path.name, False, str(e))


def main() -> int:
    ap = argparse.ArgumentParser(description="Normaliza GIFs de criaturas a lienzo fijo.")
    ap.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "game" / "data" / "images" / "creature",
        help="Carpeta con los .gif",
    )
    ap.add_argument("--canvas", type=int, default=64, help="Lado del lienzo en píxeles (default 64).")
    ap.add_argument("--margin", type=int, default=1, help="Margen interior al escalar (default 1).")
    ap.add_argument("--dry-run", action="store_true", help="Solo cuenta archivos, no escribe.")
    ap.add_argument("--limit", type=int, default=0, help="Procesar solo N archivos (0 = todos).")
    ap.add_argument("--jobs", type=int, default=0, help="Procesos paralelos (0 = mitad de CPUs).")
    args = ap.parse_args()

    root: Path = args.root
    if not root.is_dir():
        print(f"No existe la carpeta: {root}", file=sys.stderr)
        return 1

    files = sorted(root.glob("*.gif"))
    if args.limit:
        files = files[: args.limit]

    if args.dry_run:
        print(f"GIFs encontrados: {len(files)} (dry-run)")
        return 0

    if not files:
        print("No hay .gif que procesar.")
        return 0

    jobs = max(1, args.jobs or max(1, (os.cpu_count() or 4) // 2))
    ok = 0
    err = 0
    errors: list[str] = []

    if jobs == 1:
        for p in files:
            name, success, msg = process_file(str(p), args.canvas, args.margin)
            if success:
                ok += 1
            else:
                err += 1
                errors.append(f"{name}: {msg}")
    else:
        with ProcessPoolExecutor(max_workers=jobs) as ex:
            futs = {
                ex.submit(process_file, str(p), args.canvas, args.margin): p for p in files
            }
            done = 0
            total = len(futs)
            for fut in as_completed(futs):
                done += 1
                name, success, msg = fut.result()
                if success:
                    ok += 1
                else:
                    err += 1
                    errors.append(f"{name}: {msg}")
                if done % 200 == 0 or done == total:
                    print(f"  … {done}/{total}", flush=True)

    print(f"Listo: {ok} ok, {err} errores (lienzo {args.canvas}px, margen {args.margin}).")
    for line in errors[:30]:
        print(f"  ERR {line}")
    if len(errors) > 30:
        print(f"  … y {len(errors) - 30} más")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
