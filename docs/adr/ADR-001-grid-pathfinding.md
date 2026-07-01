# ADR-001: Grid lógico + A* en vez de navmesh

- **Estado**: aceptada (2026-07-01)
- **Contexto**: la migración 3D necesita pathfinding para click-to-move y para la IA de criaturas. Opciones: navmesh (recast/detour-style) o mantener el grid de tiles del juego 2D.

## Decisión

Mantener el **grid ortogonal de tiles como mundo lógico** y hacer pathfinding con **A\*** (player) y **flow-field BFS compartido** (criaturas, portado del legado). El 3D es solo presentación: las posiciones se interpolan entre centros de tile y la cámara/meshes viven en espacio continuo.

## Justificación

1. **Todo el dominio ya es tile-based**: el generador de mazmorras emite tiles, el combate usa adyacencia de tiles, los spells usan patrones de tiles (cone/nova/ring), el flow-field de criaturas es BFS sobre tiles y está optimizado (O(1) por criatura). Un navmesh obligaría a reescribir y re-balancear todo eso sin beneficio jugable.
2. **Riesgo y dependencias**: navmesh implicaría una dependencia nueva (recast-navigation-js ~1MB) o implementación propia compleja. A* sobre grid son ~100 líneas testeables.
3. **El grid es invisible en 3D** si el movimiento se interpola con suavizado y los giros usan slerp — exactamente lo que hacen ARPGs tile-based.
4. **Determinismo y tests**: grid + RNG inyectado = tests de dominio triviales.

## Consecuencias

- La geometría 3D debe alinearse al grid (1 tile = 1 unidad-mundo en XZ, configurable en `core/config.ts`).
- Movimiento diagonal permitido como en el legado (8 vecinos) con coste √2, prohibiendo corner-cutting entre dos tiles sólidas.
- Si en el futuro se quieren interiores no-tile (rampas, plataformas), se revisará este ADR.
