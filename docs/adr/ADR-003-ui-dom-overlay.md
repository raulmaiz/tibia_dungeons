# ADR-003: UI como overlay DOM (HTML/CSS) sobre el canvas 3D

- **Estado**: aceptada (2026-07-01)
- **Contexto**: la UI 2D actual (inventario, stats, loot, auth) ya es HTML/CSS puro fuera del canvas Phaser. Opciones para 3D: UI in-canvas (three-mesh-ui, sprites) o mantener DOM.

## Decisión

Mantener **toda la UI de paneles en DOM** como overlay sobre el canvas Three.js fullscreen. Solo son in-world los elementos anclados a entidades (barras de vida sobre enemigos, números de daño), implementados como elementos DOM posicionados por proyección `Vector3 → screen` (batch por frame), con fallback a sprites si el conteo lo exige.

## Justificación

- **Reutilización directa**: el `inventoryPanel`, auth y paneles legados ya son DOM; se portan con ajustes de layout, no se reescriben.
- Accesibilidad, fuentes, inputs y scroll gratis; iterar CSS es más rápido que geometría de UI.
- Coste render cero para el canvas; el DOM composita por encima.

## Consecuencias

- `game/index.html` define contenedores: `#app` (canvas) + `#hud` (overlay `pointer-events: none`, paneles con `pointer-events: auto`).
- El input del juego se captura en el canvas; los paneles hacen `stopPropagation`.
- Números de daño: pool de nodos DOM reutilizables (sin crear/destruir por hit).
