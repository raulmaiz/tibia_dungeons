# Plan de migración 3D — Phaser 2D → Three.js

**Estrategia: reemplazo total.** La 2D queda archivada en el tag `v2d-final`; `feat/3d-migration` acumula la 3D y se fusionará a `main` al alcanzar paridad. No hay modo dual.

## Objetivo

RPG 3D en navegador con cámara estilo Diablo 4, preservando las mecánicas actuales: click-to-move sobre grid, combate en tiempo real con throttling de acciones, inventario/equipo, mazmorras procedurales por plantas, stats/progresión de 4 clases. Coste operativo 0 € (assets CC0, Vercel free tier, backend Upstash existente intacto).

## Principios

1. **La lógica de dominio no se reescribe, se porta.** `CombatMath`, `progression`, `loot`, `generator` son puros y pasan a `game/src/domain` en TS con tests ANTES de tocar render (red de seguridad).
2. **El mundo lógico sigue siendo un grid de tiles.** El 3D es presentación: posiciones interpoladas, cámara y meshes. Ver ADR-001.
3. **Dominio ⟂ render**: `src/domain` y `src/systems` no importan Three.js. Comunicación por EventBus y lectura de estado.
4. **Prototipo jugable primero**, paridad después, pulido al final.

## Fases

| Fase | Contenido | Salida verificable |
|------|-----------|--------------------|
| **F0** | Tag v2d-final, Vite, ESLint, Vitest, Three.js, infra agente nocturno, ADRs | Gate `lint+typecheck+test` verde; escena vacía renderiza |
| **F1** | Prototipo: terreno, personaje glTF idle/walk, click-to-move A*, cámara Diablo 4, 1 enemigo melee, HUD mínimo | Se juega: mover, atacar, matar, morir |
| **F2** | Mazmorras: adaptador generator→instancias, render instanciado por tema, escaleras/plantas, catálogos JSON, spawning | Run completa por plantas generadas |
| **F3** | Combate: tab/click target, spells 1–4 con patrones, ranged+ammo, VFX básicos | Paridad de combate con la 2D |
| **F4** | Inventario/equipo overlay DOM, loot+pity, persistencia contra backend existente | Guardar y reanudar una run |
| **F5** | Paridad total: IA flow-field, progresión completa, atmósfera, assets CC0 definitivos, audio | Feature-parity con `v2d-final` |
| **F6** | Rendimiento (60fps), deploy Vercel (con OK del usuario), README | Live en tibia-dungeons.com |

El detalle granular por tarea (criterios de aceptación, archivos, dependencias) vive en [`backlog.md`](backlog.md).

## Cámara Diablo 4 (spec de referencia)

- Perspectiva (FOV ~45°), pivote = posición interpolada del player.
- Pitch fijo ~57° desde la vertical (rango permitido en config: 55–60°). No modificable por input.
- Distancia (zoom) por rueda: límites [8, 26] unidades-mundo, suavizado.
- Yaw libre SOLO con botón derecho mantenido; al soltar se conserva.
- Seguimiento con lerp exponencial (`1 - exp(-k·dt)`), sin snapping ni dead-zones.

## Controles

Click izq. = mover (A*) / atacar si el pick es un enemigo · Botón der. mantenido = rotar cámara · Rueda = zoom · `1–4` = skills · `Tab` = ciclar target · `F3` = FPS.

## Mapa de portado (legado → nuevo)

| Legado (`game/js`) | Destino (`game/src`) | Cambio |
|---|---|---|
| `engine/systems/CombatMath.js` | `domain/combat/math.ts` | TS + RNG inyectado |
| `mechanics/progression.js` | `domain/progression.ts` | TS directo |
| `mechanics/loot.js` | `domain/loot.ts` | TS + tests pity |
| `dungeon/generator.js` | `domain/dungeon/generator.ts` | TS + seed inyectable |
| `core/EventBus.js` | `core/events.ts` | TS + tipos de eventos |
| `world/Projection.js` | `core/grid.ts` | grid↔mundo 3D (XZ) |
| `rendering/SpriteFactory.js` | `render/models.ts` | glTF + InstancedMesh |
| `engine/systems/CreatureMovement.js` | `systems/ai.ts` | flow-field intacto, salida = waypoints |
| `ui/*` (HTML/CSS) | `ui/*` | overlay DOM reutilizado |
| `engine/game.engine.js` (closure 3.1k) | repartido en `entities/` + `systems/` | NO se porta entero: se desmonta |

## Qué se elimina (archivado en v2d-final)

Phaser (CDN + código de escena), `vfx.js`, `SpellParticles.js` (recrear en 3D), `floorAtmosphere.js` (recrear), esbuild y `scripts/build*.js`, service worker 2D (`game/sw.js`, se re-evalúa en F6), `app.py`/`frames_output` (herramienta de sprites 2D, ya sin uso).

## Riesgos conocidos

- **El experimento 3D anterior se abandonó** (dev-log 2026-06-03) por intentar un look "3D-like" isométrico calcado. Mitigación: esta vez es 3D real low-poly con cámara libre-yaw, dominio portado con tests y fases con salida jugable en cada paso.
- **Rendimiento en portátil medio**: presupuesto estricto (instancing, 2–3 luces, culling) desde F2, no como afterthought.
- **`game.engine.js` monolítico**: se desmonta pieza a pieza por sistema, nunca "big-bang".
