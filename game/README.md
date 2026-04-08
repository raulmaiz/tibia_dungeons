# Tibia Dungeons (Phaser 3)

Visor y base para un juego en Phaser 3 que consume datos JSON exportados de tibiawiki-sql.

## Estructura
- `index.html`: app estática con buscador y lienzo Phaser.
- `js/`: lógica de carga (`dataService.js`) y escena (`main.js`).
- `data/`: JSON por tabla + `manifest.json` (items/creatures → rutas de imágenes).
- `data/images/`: imágenes (ignoradas por git para evitar peso; opcional con Git LFS).

## Servir localmente
```bash
python3 -m http.server 8080 -b 127.0.0.1
# Abrir: http://127.0.0.1:8080/game/
```

## Refrescar datos
1) Volcar JSONs desde la base:
```bash
python3 ../scripts/dump_all_to_json.py --db ../tibiawiki.api.db --out ./data
```
2) Copiar imágenes (opcional):
```bash
cp -a ../images/. ./data/images/
```
3) Construir manifest:
```bash
python3 ../scripts/build_manifest.py --data ./data --images ./data/images --out ./data/manifest.json
```

## Git LFS (opcional)
Para subir imágenes:
```bash
git lfs install
git lfs track "*.gif" "*.png" "data/images/**"
```