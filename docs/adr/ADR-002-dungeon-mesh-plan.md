# ADR-002: Formato de mazmorras — TileMap lógico + MeshPlan derivado

- **Estado**: aceptada (2026-07-01)
- **Contexto**: el generador procedural (`dungeon/generator.js`: salas + MST + pasillos en L) emite un grid de tipos de tile. Hay libertad para rediseñar el formato de datos para 3D.

## Decisión

**Dos capas separadas:**

1. **`TileMap` (dominio, sin cambios de algoritmo)**: salida del generador portado. Grid 2D de `TileType` (`floor | wall | door | stairs | void`) + metadatos (spawn, salas, tema). Es lo que consumen pathfinding, IA, spawning y tests.
2. **`MeshPlan` (adaptador puro, nuevo)**: `buildMeshPlan(tileMap, theme)` deriva una lista de instancias por tipo de pieza: `{ piece: 'floor'|'wall'|'wallCorner'|'stairs'|'prop', gx, gy, rotationY, variant }`. El render lo consume con un `InstancedMesh` por pieza/material.

El `MeshPlan` **no se serializa ni se guarda**: se deriva del `TileMap` al entrar a la planta. Los saves siguen guardando el `TileMap` (+ estado de criaturas/loot), igual que el snapshot legado.

## Justificación

- **El algoritmo del generador funciona y está balanceado** (tamaños de sala, densidad, loops); rediseñarlo sería riesgo sin necesidad. Solo se le inyecta el seed/RNG para tests.
- Derivar en vez de generar geometría directa mantiene el dominio libre de conceptos de render y hace el adaptador **testeable sin GPU** (props: toda tile walkable tiene suelo; toda frontera walkable/sólido tiene pared orientada; escalera única alcanzable).
- Paredes como piezas por-borde (no cubos por-tile) dan mejor look 3D con la cámara baja de Diablo y menos instancias.
- `variant` permite variedad visual (2–3 mallas por pieza) sin tocar la lógica.

## Consecuencias

- Nuevos módulos: `domain/dungeon/tilemap.ts` (tipos), `domain/dungeon/meshPlan.ts` (adaptador + tests).
- `floorThemes` legado (~1.450 líneas de tablas 2D) se destila a paletas/material-params 3D por tema; no se porta entero.
- El formato de save de plantas se mantiene compatible en espíritu con los caps del backend (no se toca `api/`).
