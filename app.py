from datetime import datetime
from pathlib import Path

from flask import Flask, abort, jsonify, render_template_string, request, send_from_directory, url_for
from PIL import Image, ImageSequence, UnidentifiedImageError

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
GIFS_SOURCES = {
    "data/images": BASE_DIR / "data" / "images",
    "game/data/images": BASE_DIR / "game" / "data" / "images",
}
FRAMES_DIR = BASE_DIR / "frames_output"
ALLOWED_EXTENSIONS = {".gif", ".webp"}
ALLOWED_REAL_FORMATS = {"GIF", "WEBP"}

FRAMES_DIR.mkdir(parents=True, exist_ok=True)

PAGE_TEMPLATE = """
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <title>GIF Splitter</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      .hint { color: #666; margin-top: 0.25rem; }
      .error { color: #b91c1c; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
        margin-top: 1.5rem;
      }
      .frame { border: 1px solid #ddd; border-radius: 8px; padding: 8px; text-align: center; }
      .frame img { max-width: 100%; height: auto; image-rendering: pixelated; }
      .frame p { margin: 0.5rem 0 0; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <h1>Separar GIF en imágenes</h1>
    <form method="post" action="/split">
      <label for="gif_name">GIF disponible:</label>
      <select id="gif_name" name="gif_name" required>
        {% for gif in gifs %}
          <option value="{{ gif }}" {% if gif == selected_gif %}selected{% endif %}>{{ gif }}</option>
        {% endfor %}
      </select>
      <button type="submit">Hacer split</button>
    </form>

    <p class="hint">Leyendo archivos .gif desde: <code>{{ gifs_dir }}</code></p>

    {% if not gifs %}
      <p class="error">No hay GIFs en la carpeta configurada.</p>
    {% endif %}

    {% if error %}
      <p class="error">{{ error }}</p>
    {% endif %}

    {% if frame_urls %}
      <h2>Resultado para {{ selected_gif }} ({{ frame_urls|length }} frames)</h2>
      <div class="grid">
        {% for frame_url in frame_urls %}
          <div class="frame">
            <img src="{{ frame_url }}" alt="frame {{ loop.index0 }}">
            <p>frame {{ loop.index0 }}</p>
          </div>
        {% endfor %}
      </div>
    {% endif %}
  </body>
</html>
"""


def available_gifs():
    gifs = []
    for source_name, source_dir in GIFS_SOURCES.items():
        if not source_dir.exists():
            continue
        for p in source_dir.rglob("*"):
            if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS:
                relative = p.relative_to(source_dir).as_posix()
                gifs.append(f"{source_name}/{relative}")
    return sorted(gifs)


def split_gif(gif_name: str):
    normalized = Path(gif_name.replace("\\", "/"))
    if (
        normalized.is_absolute()
        or ".." in normalized.parts
        or normalized.suffix.lower() not in ALLOWED_EXTENSIONS
    ):
        raise ValueError("Nombre de archivo inválido.")

    parts = normalized.parts
    if len(parts) < 4:
        raise ValueError("Selecciona un GIF válido desde las carpetas configuradas.")

    source_key = "/".join(parts[:3])
    source_dir = GIFS_SOURCES.get(source_key)
    if source_dir is None:
        raise ValueError("Origen de GIF no permitido.")

    relative_path = Path(*parts[3:])
    gif_path = source_dir / relative_path
    if not gif_path.exists() or not gif_path.is_file():
        raise FileNotFoundError(f"No existe {gif_name} en las carpetas de imágenes.")

    run_id = f"{gif_path.stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    output_dir = FRAMES_DIR / run_id
    output_dir.mkdir(parents=True, exist_ok=True)

    frame_files = []
    try:
        with Image.open(gif_path) as image:
            if image.format not in ALLOWED_REAL_FORMATS:
                raise ValueError(
                    f"Formato real no soportado ({image.format}). Solo GIF/WEBP animado."
                )

            for idx, frame in enumerate(ImageSequence.Iterator(image)):
                rgb_frame = frame.convert("RGBA")
                file_name = f"frame_{idx:04d}.png"
                rgb_frame.save(output_dir / file_name, format="PNG")
                frame_files.append(file_name)
    except UnidentifiedImageError as exc:
        raise ValueError("El archivo seleccionado no es una imagen válida.") from exc

    return run_id, frame_files


@app.get("/")
def index():
    return render_template_string(
        PAGE_TEMPLATE,
        gifs=available_gifs(),
        selected_gif=None,
        frame_urls=[],
        error=None,
        gifs_dir=", ".join([str(path) for path in GIFS_SOURCES.values()]),
    )


@app.post("/split")
def split():
    gif_name = request.form.get("gif_name", "").strip()
    gifs = available_gifs()

    try:
        run_id, frame_files = split_gif(gif_name)
        frame_urls = [url_for("frame_file", run_id=run_id, filename=f) for f in frame_files]
        error = None
    except (ValueError, FileNotFoundError) as exc:
        frame_urls = []
        error = str(exc)

    return render_template_string(
        PAGE_TEMPLATE,
        gifs=gifs,
        selected_gif=gif_name,
        frame_urls=frame_urls,
        error=error,
        gifs_dir=", ".join([str(path) for path in GIFS_SOURCES.values()]),
    )


@app.get("/frames/<run_id>/<path:filename>")
def frame_file(run_id: str, filename: str):
    target_dir = FRAMES_DIR / Path(run_id).name
    if not target_dir.exists():
        abort(404)
    return send_from_directory(target_dir, filename)


@app.get("/api/gifs")
def gifs_api():
    return jsonify({"gifs": available_gifs()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
