# Backlog — Migración 3D

> Fuente de verdad de tareas. El agente nocturno las toma **en orden** dentro de la fase activa.
> Estados: `⬜ pendiente` · `🔄 en curso` · `✅ hecha` · `⛔ bloqueada (ver night-log)`.
> Regla: una tarea = 1–3 h. Si al empezar parece mayor, dividirla aquí antes de codificar.

## F0 — Infraestructura

| ID | Estado | Tarea |
|----|--------|-------|
| T-001 | ✅ | Tag `v2d-final` + rama `feat/3d-migration` |
| T-002 | ✅ | Migrar build a Vite |
| T-003 | ✅ | ESLint flat config, baseline verde sobre `game/src` |
| T-004 | ✅ | Vitest + tests de módulos puros portados (36 asserts) |
| T-005 | ✅ | Three.js por npm + escena renderizando |
| T-006 | ✅ | Infra agente nocturno (CLAUDE.md, backlog, night-log, settings) |
| T-007 | ✅ | `docs/migration-3d.md` + ADRs 001–004 |

### T-002 — Migrar build a Vite
- **Descripción**: sustituir esbuild/scripts propios por Vite. Root = `game/`, `outDir=dist`. Nuevo `index.html` mínimo (canvas 3D + contenedor HUD). Actualizar scripts npm (`dev`, `build`, `preview`, `typecheck`, `lint`, `test`).
- **Criterios de aceptación**: `npm run dev` sirve la app con HMR; `npm run build` genera `game/dist` sin borrar fuentes; los scripts legacy destructivos (`build --prod` que borraba `game/js`) quedan eliminados.
- **Archivos**: `package.json`, `vite.config.ts`, `game/index.html`, `tsconfig.json`, borrar `scripts/build.js`, `scripts/dev-server.js`, `scripts/build-itch.js`.
- **Dependencias**: —

### T-003 — ESLint
- **Criterios**: `npm run lint` verde; config flat (`eslint.config.js`) sobre `game/src` (TS); legado `game/js` excluido.
- **Archivos**: `eslint.config.js`, `package.json`.
- **Dependencias**: T-002.

### T-004 — Vitest + tests de dominio
- **Descripción**: portar a `game/src/domain` los módulos puros (`CombatMath`, `progression`, `loot` pity tracker, `dungeon/generator`) convirtiéndolos a TS, y cubrirlos con tests (daño con multiplicador de planta, miss/crit con RNG inyectado, stats por nivel/clase, generador produce mazmorra conexa con escaleras).
- **Criterios**: `npm run test` verde con ≥ 15 asserts significativos; los módulos NO importan nada de render; RNG inyectable para determinismo.
- **Archivos**: `game/src/domain/**`, `game/src/domain/__tests__/**`, `vitest.config.ts`.
- **Dependencias**: T-002.

### T-005 — Three.js
- **Criterios**: `three` (r160+) y `@types/three` en package.json; `npm run dev` muestra un canvas WebGL con clear color y una malla de prueba; sin errores de consola.
- **Dependencias**: T-002.

## F1 — Prototipo mínimo jugable

> ✅ T-010, T-011, T-012, T-013 completadas (commit `1f540cb`). T-014 parcial: falta la barra de mana
> (se añade con los spells en T-031) — HP, floaters de daño, F3 fps y panel de muerte hechos.

### T-010 — Terreno + iluminación + cámara Diablo 4
- **Descripción**: suelo de prueba (plano con textura procedural de grid), luz hemisférica + direccional con sombras. `Diablo4Camera`: orbital sobre el player, pitch fijo ~57° desde la vertical, zoom por rueda con límites [8, 26], yaw rotando con botón derecho mantenido, seguimiento con lerp (sin snapping).
- **Criterios**: 60 fps con escena vacía; la cámara nunca cambia el pitch; el zoom respeta límites; soltar botón derecho conserva el yaw.
- **Archivos**: `game/src/render/scene.ts`, `game/src/render/camera.ts`, `game/src/main.ts`.
- **Dependencias**: T-005.

### T-011 — Personaje glTF animado
- **Descripción**: cargar modelo low-poly con clips idle/walk (placeholder: `Soldier.glb` de three.js examples; reemplazo definitivo CC0 en T-052b). AnimationMixer con crossfade idle↔walk.
- **Criterios**: idle en reposo, walk al moverse, transición suave <0.3s, el modelo mira hacia la dirección de movimiento.
- **Archivos**: `game/src/render/character.ts`, `game/public/assets/models/`, `game/public/assets/CREDITS.md`.
- **Dependencias**: T-010.

### T-012 — Click-to-move con A*
- **Descripción**: click izquierdo → raycast al suelo → tile destino → A* sobre grid lógico → cola de waypoints → interpolación suave de la posición del player. Marcador visual de destino.
- **Criterios**: rodea obstáculos; clicks sucesivos re-planifican; el movimiento usa la velocidad derivada del dominio (`PLAYER_MOVE_DURATION_BASE_MS`).
- **Archivos**: `game/src/systems/pathfinding.ts`, `game/src/systems/movement.ts`, `game/src/input/pointer.ts`, `game/src/core/grid.ts`.
- **Dependencias**: T-010, T-011.

### T-013 — Enemigo básico + combate melee
- **Descripción**: 1 criatura que persigue al player (A* re-planificado con throttle) y ataca en adyacencia usando `domain/combat` (throttling 320ms, crit, miss). Click sobre el enemigo → el player lo persigue y ataca. Muerte → animación/despawn.
- **Criterios**: HP de ambos bajan según `CombatMath` portado; el enemigo muere y desaparece; el player puede morir (respawn simple).
- **Archivos**: `game/src/systems/ai.ts`, `game/src/entities/{player,creature}.ts`, `game/src/systems/combat-loop.ts`.
- **Dependencias**: T-012, T-004.

### T-014 — HUD mínimo
- **Criterios**: barras HP/mana del player (DOM overlay), números de daño flotantes en 3D→2D projection, contador FPS toggle con `F3`.
- **Archivos**: `game/src/ui/hud.ts`, `game/index.html`.
- **Dependencias**: T-013.

## F2 — Mazmorras 3D

> ✅ F2 completada (noche 2026-07-01, commits `8fc0fd2`→`7f2d444`). Notas:
> spawns capados a 30 rigs por rendimiento hasta T-052b/T-060; plantas 21+
> ciclan las tablas 1–20 (la progresión pooled del legacy para 21+ queda
> pendiente como tarea nueva T-025); drop tables van en T-041.

### T-025 — Progresión de plantas 21+ (pooled random groups del legacy) ⬜
- **Descripción**: portar `pickGroupForLevel` + pools por experiencia del engine legacy para plantas >20, sustituyendo el ciclado actual.
- **Dependencias**: T-024.

### T-020 — Adaptador generator → escena 3D (ADR-002)
- **Descripción**: el generador legado emite `TileMap` (grid de tipos). Nuevo módulo `domain/dungeon/meshPlan.ts` que lo transforma en un plan de instancias (suelo, pared, puerta, escalera, prop) consumible por el render. Sin tocar el algoritmo de generación.
- **Criterios**: test: toda tile walkable tiene suelo; toda frontera walkable/no-walkable tiene pared; hay exactamente 1 escalera alcanzable desde el spawn (BFS en test).
- **Dependencias**: T-004.

### T-021 — Render instanciado de mazmorra
- **Descripción**: `InstancedMesh` por tipo de pieza (suelo/pared/prop) con materiales por tema de planta (`floorThemes` portado a paleta 3D simplificada).
- **Criterios**: mazmorra completa (≥ 60×36 tiles) a 60 fps; draw calls < 30; el player navega por ella con click-to-move.
- **Dependencias**: T-020, T-012.

### T-022 — Escaleras y cambio de planta
- **Criterios**: pisar la escalera → fade → nueva planta generada → player en spawn; el estado del player persiste entre plantas.
- **Dependencias**: T-021.

### T-023 — Catálogos de datos servibles por Vite
- **Descripción**: mover `game/data/*.json` (creatures, items, spells) a `game/public/data/` y portar `dataService` a TS con fetch tipado.
- **Criterios**: catálogos cargan en dev y build; tipos TS para creature/item/spell.
- **Dependencias**: T-002.

### T-024 — Spawning de criaturas por planta
- **Descripción**: portar `floorSpawnConfig` y poblar la mazmorra con criaturas del pool (modelos placeholder por familia: melee/ranged/caster con tintes).
- **Criterios**: counts respetan min/max del config; spawns solo en tiles walkable fuera del radio del player.
- **Dependencias**: T-021, T-023, T-013.

## F3 — Paridad de combate

### T-030 — Tab-target y click-target
- **Criterios**: `Tab` cicla enemigos visibles por distancia; indicador visual bajo el target; click sobre enemigo = target + auto-atacar en rango.
- **Dependencias**: T-024.

### T-031 — Skills 1–4 (spells)
- **Descripción**: portar `SpellCasting` + patrones (single/cone/nova/ring) del dominio; teclas 1–4 lanzan los spells aprendidos; coste de mana y cooldown.
- **Criterios**: patrones de área golpean las tiles correctas (tests de patrón); VFX básico por elemento.
- **Dependencias**: T-030, T-004.

### T-032 — Armas ranged + ammo
- **Criterios**: proyectil visible, consumo de ammo, miss rate de throwables (50%) respetado.
- **Dependencias**: T-030.

### T-033 — VFX de combate básicos
- **Criterios**: flash de daño, partículas de impacto (THREE.Points), shake de cámara leve en crit; presupuesto: sin caídas por debajo de 55 fps.
- **Dependencias**: T-031.

## F4 — Inventario, loot y persistencia

### T-040 — Overlay de inventario/equipo
- **Descripción**: portar el HTML/CSS del `inventoryPanel` legado como overlay DOM sobre el canvas; drag & drop de items.
- **Dependencias**: T-023.

### T-041 — Loot: drops + pity tracker
- **Criterios**: drop tables del catálogo respetadas; tests del pity tracker portados; bolsa de loot en el suelo clickable.
- **Dependencias**: T-040, T-024.

### T-042 — Persistencia con backend existente
- **Descripción**: reconectar login/saves/leaderboard (`api/`) desde la UI 3D. **NO modificar el backend**; solo el cliente. Fallback localStorage si no hay sesión.
- **Criterios**: guardar y reanudar una run funciona contra el backend en dev; snapshot ≤ caps existentes.
- **Dependencias**: T-040.

## F5 — Paridad completa

### T-050 — IA flow-field portada
- **Criterios**: BFS compartido por tick como el legado; 15 criaturas simultáneas sin caída de fps.
- **Dependencias**: T-024.

### T-051 — Progresión completa + UI de stats/skills
- **Dependencias**: T-040.

### T-052 — Atmósfera: luces por tema, niebla, props
- **Criterios**: máx. 2–3 luces dinámicas; resto baked/emissive.
- **Dependencias**: T-021.

### T-052b — Assets definitivos CC0
- **Descripción**: sustituir placeholders por pack coherente (Quaternius/KayKit dungeon + characters). Documentar en `CREDITS.md`.
- **Dependencias**: T-024.

### T-053 — Audio (WebAudio, samples CC0)
- **Dependencias**: T-033.

## F6 — Rendimiento y deploy

### T-060 — Presupuesto de rendimiento
- **Criterios**: 60 fps en portátil medio (validar con CPU 4x throttle en devtools ≥ 30 fps); LOD/culling donde haga falta.
### T-061 — Deploy Vercel (requiere confirmación del usuario)
- **Criterios**: `vercel.json` actualizado a build Vite; preview desplegada; `main` NO se toca sin OK explícito.
### T-062 — README nuevo (dev, build, deploy, arquitectura)

## Bloqueos conocidos

- (ninguno)
