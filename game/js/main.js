import { getCreatureProgressionByExperience } from './dataService.js';

let game;
let selectedSex = 'male';
let playerConfig = null;
let progressionTiers = [];

const DUNGEON_LEVELS = 8;
const CREATURES_PER_LEVEL = 3;
const CREATURE_POOL_PER_LEVEL = 12;
const CREATURE_SPAWNS = [
  { gx: 5, gy: 5 },
  { gx: 8, gy: 9 },
  { gx: 14, gy: 11 },
];
const STAIRS_TILE = { gx: 18, gy: 13 };

const MAP = [
  '####################',
  '#..............#...#',
  '#..######......#...#',
  '#..#....#..........#',
  '#..#....#######....#',
  '#..............#...#',
  '#..######..##..#...#',
  '#..#.......##......#',
  '#..#..##########...#',
  '#..............#...#',
  '#######........#...#',
  '#..................#',
  '#..######..######..#',
  '#..................#',
  '####################',
];

function frameTextureName(sex, frame) {
  return `player_${sex}_${frame}`;
}

function deathTextureName(sex) {
  return `player_death_${sex}`;
}

function creatureKey(template) {
  return `creature_${template.id}`;
}

function creaturePlural(name, count) {
  return `${name}${count === 1 ? '' : 's'}`;
}

function pickRandomCreatures(pool, count) {
  if (!pool || pool.length === 0) return [];
  const copy = [...pool];
  Phaser.Utils.Array.Shuffle(copy);
  if (copy.length >= count) return copy.slice(0, count);
  const out = [...copy];
  while (out.length < count) out.push(copy[out.length % copy.length]);
  return out;
}

function setupSelectorUI() {
  const choiceMale = document.getElementById('choiceMale');
  const choiceFemale = document.getElementById('choiceFemale');
  const startBtn = document.getElementById('startBtn');
  const playerNameInput = document.getElementById('playerName');
  playerNameInput.focus();

  function setChoice(sex) {
    selectedSex = sex;
    choiceMale.classList.toggle('active', sex === 'male');
    choiceFemale.classList.toggle('active', sex === 'female');
  }

  choiceMale.addEventListener('click', () => setChoice('male'));
  choiceFemale.addEventListener('click', () => setChoice('female'));

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    const playerName = (playerNameInput.value || '').trim() || 'Adventurer';
    playerConfig = { name: playerName, sex: selectedSex };
    await loadProgressionDatabase();
    document.getElementById('startOverlay').style.display = 'none';
    startGame(playerConfig);
  });

  playerNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!startBtn.disabled) startBtn.click();
    }
  });
}

function isWalkableTile(gx, gy) {
  if (gy < 0 || gy >= MAP.length || gx < 0 || gx >= MAP[gy].length) return false;
  return MAP[gy][gx] !== '#';
}

function startGame(configPlayer) {
  if (game) return;

  const tileSize = 40;
  const mapWidth = MAP[0].length * tileSize;
  const mapHeight = MAP.length * tileSize;
  const width = Math.min(window.innerWidth, mapWidth);
  const height = Math.min(window.innerHeight, mapHeight);

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser',
    backgroundColor: '#0a1220',
    width,
    height,
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: {
      preload() {
        for (let i = 0; i < 4; i += 1) {
          this.load.image(frameTextureName('male', i), `./data/images/outfit_frames/male_${i}.png`);
          this.load.image(frameTextureName('female', i), `./data/images/outfit_frames/female_${i}.png`);
        }
        this.load.image(deathTextureName('male'), './data/images/other/you_are_death_male.jpg');
        this.load.image(deathTextureName('female'), './data/images/other/you_are_death_female.jpg');
        const unique = new Map();
        for (const tier of progressionTiers) {
          for (const c of tier.creatures) {
            if (!unique.has(c.id)) unique.set(c.id, c);
          }
        }
        for (const c of unique.values()) {
          this.load.image(creatureKey(c), `./data/images/${c.image}`);
        }
      },
      create() {
        for (let y = 0; y < MAP.length; y += 1) {
          for (let x = 0; x < MAP[y].length; x += 1) {
            const isWall = MAP[y][x] === '#';
            const color = isWall ? 0x2f3a4a : 0x1a2534;
            this.add.rectangle(
              x * tileSize + tileSize / 2,
              y * tileSize + tileSize / 2,
              tileSize - 1,
              tileSize - 1,
              color
            );
          }
        }

        const player = this.add.sprite(tileSize * 1.5, tileSize * 1.5, frameTextureName(configPlayer.sex, 0));
        // Centrado visual y tamano menor a 1 tile para evitar solapes entre casillas vecinas.
        player.setOrigin(0.5, 0.5);
        player.setDisplaySize(tileSize * 0.9, tileSize * 0.9);
        const deathCaption = this.add.text(player.x, player.y + tileSize * 0.72, 'You are dead.', {
          color: '#ffffff',
          fontSize: '12px',
          fontStyle: 'bold',
        });
        deathCaption.setOrigin(0.5, 0.5);
        deathCaption.setVisible(false);
        const basePlayerScaleX = player.scaleX;
        const basePlayerScaleY = player.scaleY;
        const makeHealthBar = (color = 0x22c55e) => {
          const bg = this.add.rectangle(0, 0, tileSize * 0.9, 5, 0x111111, 0.95);
          const fill = this.add.rectangle(0, 0, tileSize * 0.86, 3, color, 1);
          bg.setStrokeStyle(1, 0x000000, 0.8);
          // Anclaje a la izquierda para evitar drift visual al reducir HP.
          bg.setOrigin(0.5, 0.5);
          fill.setOrigin(0, 0.5);
          return { bg, fill, width: tileSize * 0.86 };
        };
        const makeNameLabel = (text, color = '#e5e7eb') => {
          const label = this.add.text(0, 0, text, {
            color,
            fontSize: '11px',
            fontStyle: 'bold',
          });
          label.setOrigin(0.5, 0.5);
          return label;
        };
        const nameColorByHpRatio = (ratio) => {
          if (ratio > 0.66) return '#22c55e'; // verde
          if (ratio > 0.33) return '#facc15'; // amarillo
          return '#ef4444'; // rojo
        };
        const barColorByHpRatio = (ratio) => {
          if (ratio > 0.66) return 0x22c55e; // verde
          if (ratio > 0.33) return 0xfacc15; // amarillo
          return 0xef4444; // rojo
        };
        const placeHealthBar = (bar, x, y) => {
          bar.bg.setPosition(x, y);
          bar.fill.setPosition(x - bar.width / 2, y);
        };
        const setHealthBarRatio = (bar, ratio) => {
          const clamped = Phaser.Math.Clamp(ratio, 0, 1);
          bar.fill.width = Math.max(0, bar.width * clamped);
        };
        const playerBar = makeHealthBar(0x22c55e);
        const playerNameTag = makeNameLabel(configPlayer.name, '#e5e7eb');

        const nameLabel = this.add.text(12, 10, `${configPlayer.name} (${configPlayer.sex})`, {
          color: '#e5e7eb',
          fontSize: '16px',
        });
        nameLabel.setScrollFactor(0);

        const help = this.add.text(12, 30, 'WASD/Flechas | Sur=0 Este=1 Norte=2 Oeste=3', {
          color: '#a5b4fc',
          fontSize: '13px',
        });
        help.setScrollFactor(0);
        const combatHud = this.add.text(12, 50, '', {
          color: '#fca5a5',
          fontSize: '13px',
        });
        combatHud.setScrollFactor(0);
        const combatLog = this.add.text(12, 70, 'Combate listo.', {
          color: '#fde68a',
          fontSize: '13px',
          wordWrap: { width: 520 },
        });
        combatLog.setScrollFactor(0);
        const levelHud = this.add.text(12, 90, '', {
          color: '#93c5fd',
          fontSize: '13px',
        });
        levelHud.setScrollFactor(0);

        const stairRect = this.add.rectangle(
          tileSize * STAIRS_TILE.gx + tileSize / 2,
          tileSize * STAIRS_TILE.gy + tileSize / 2,
          tileSize - 6,
          tileSize - 6,
          0x7c5c16
        );
        stairRect.setStrokeStyle(2, 0xfacc15, 1);
        const stairText = this.add.text(stairRect.x - 6, stairRect.y - 10, '>', {
          color: '#fde68a',
          fontSize: '18px',
          fontStyle: 'bold',
        });
        stairText.setOrigin(0.5, 0.5);

        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
        this.cameras.main.startFollow(player, true, 0.15, 0.15);

        const cursors = this.input.keyboard.createCursorKeys();
        const keys = this.input.keyboard.addKeys('W,A,S,D');
        const ctrlKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
        let gridX = 1;
        let gridY = 1;
        let moving = false;
        const stepDurationMs = 120;
        let playerHp = 100;
        const playerMaxHp = 100;
        const playerDamage = 12;
        let gameOver = false;
        let playerDead = false;
        let currentLevel = 1;
        const centerX = (gx) => gx * tileSize + tileSize / 2;
        const centerY = (gy) => gy * tileSize + tileSize / 2;

        const creatures = [];

        const isWalkable = (gx, gy) => isWalkableTile(gx, gy);
        const isAdjacent = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) === 1;
        const aliveCreatures = () => creatures.filter((c) => c.alive);
        const creatureAt = (gx, gy) => aliveCreatures().find((c) => c.gx === gx && c.gy === gy) || null;
        const isOccupiedByActor = (gx, gy) => {
          if (gx === gridX && gy === gridY) return true;
          return Boolean(creatureAt(gx, gy));
        };
        const orientCreatureSprite = (creature, dx, dy) => {
          // Tabla cerrada N/S/O/E.
          creature.sprite.setAngle(0);
          creature.sprite.setFlipX(false);
          creature.sprite.setFlipY(false);

          if (dx < 0) {
            // OESTE
            creature.sprite.setAngle(90);
            return;
          }
          if (dx > 0) {
            // ESTE (calibrado)
            creature.sprite.setAngle(-90);
            creature.sprite.setFlipX(true);
            return;
          }
          if (dy < 0) {
            // NORTE
            creature.sprite.setFlipY(true);
            return;
          }
          // SUR
          return;
        };
        const inAggroRange = (creature) => Math.abs(gridX - creature.gx) <= 4 && Math.abs(gridY - creature.gy) <= 4;
        const hasAggro = (creature) => creature.aggroLocked || inAggroRange(creature);
        const updatePlayerBar = () => {
          placeHealthBar(playerBar, player.x, player.y - tileSize * 0.62);
          playerNameTag.setPosition(player.x, player.y - tileSize * 0.8);
          const ratio = playerHp / playerMaxHp;
          setHealthBarRatio(playerBar, ratio);
          if (playerHp <= 0) {
            playerNameTag.setColor('#000000');
            playerBar.fill.setFillStyle(0x000000, 1);
          } else {
            playerNameTag.setColor(nameColorByHpRatio(ratio));
            playerBar.fill.setFillStyle(barColorByHpRatio(ratio), 1);
          }
        };
        const updateCreatureBar = (creature) => {
          if (!creature.hpBar) return;
          placeHealthBar(creature.hpBar, creature.sprite.x, creature.sprite.y - tileSize * 0.62);
          if (creature.nameTag) {
            creature.nameTag.setPosition(creature.sprite.x, creature.sprite.y - tileSize * 0.8);
          }
          const ratio = creature.hp / creature.maxHp;
          setHealthBarRatio(creature.hpBar, ratio);
          if (creature.nameTag) creature.nameTag.setColor(nameColorByHpRatio(ratio));
          creature.hpBar.fill.setFillStyle(barColorByHpRatio(ratio), 1);
          creature.hpBar.bg.setVisible(creature.alive);
          creature.hpBar.fill.setVisible(creature.alive);
          if (creature.nameTag) creature.nameTag.setVisible(creature.alive);
        };
        const updateAllHealthBars = () => {
          updatePlayerBar();
          for (const c of creatures) updateCreatureBar(c);
        };
        const getCurrentTier = () => progressionTiers[Math.min(currentLevel - 1, progressionTiers.length - 1)];
        const hasStairsAtPlayer = () => gridX === STAIRS_TILE.gx && gridY === STAIRS_TILE.gy;
        const spawnCreaturesForLevel = (level) => {
          for (const c of creatures) {
            c.sprite.destroy();
            if (c.hpBar) {
              c.hpBar.bg.destroy();
              c.hpBar.fill.destroy();
            }
            if (c.nameTag) c.nameTag.destroy();
          }
          creatures.length = 0;

          const tier = progressionTiers[Math.min(level - 1, progressionTiers.length - 1)];
          const levelPool = (tier && tier.creatures && tier.creatures.length > 0)
            ? tier.creatures
            : [{ id: 1116, title: 'Rat', experience: 5, hitpoints: 20, maxDamage: 8, image: 'creature/Rat.gif' }];
          const templates = pickRandomCreatures(levelPool, CREATURES_PER_LEVEL);

          for (let i = 0; i < CREATURES_PER_LEVEL; i += 1) {
            const spawn = CREATURE_SPAWNS[i % CREATURE_SPAWNS.length];
            const template = templates[i % templates.length];
            if (!isWalkableTile(spawn.gx, spawn.gy)) continue;

            const sprite = this.add.sprite(centerX(spawn.gx), centerY(spawn.gy), creatureKey(template));
            sprite.setOrigin(0.5, 0.5);
            sprite.setDisplaySize(tileSize * 0.9, tileSize * 0.9);
            creatures.push({
              sprite,
              gx: spawn.gx,
              gy: spawn.gy,
              hp: Math.max(1, Number(template.hitpoints || 1)),
              maxHp: Math.max(1, Number(template.hitpoints || 1)),
              maxDamage: Math.max(1, Number(template.maxDamage || 1)),
              title: template.title,
              experience: Number(template.experience || 0),
              alive: true,
              nextWanderAt: 0,
              aggroLocked: false,
              hpBar: makeHealthBar(0xef4444),
              nameTag: makeNameLabel(template.title, '#f3f4f6'),
            });
            updateCreatureBar(creatures[creatures.length - 1]);
          }
          const first = templates[0];
          combatLog.setText(
            `Nivel ${level}: ${creaturePlural(first.title, CREATURES_PER_LEVEL)} (exp base ${first.experience}).`
          );
        };
        const descendLevel = () => {
          currentLevel += 1;
          spawnCreaturesForLevel(currentLevel);
          gridX = 1;
          gridY = 1;
          player.x = centerX(gridX);
          player.y = centerY(gridY);
          updatePlayerBar();
        };
        const updateHud = () => {
          const tier = getCurrentTier();
          const tierName = tier && tier.creatures[0] ? tier.creatures[0].title : 'Creature';
          combatHud.setText(
            `HP ${playerHp}/${playerMaxHp} | ${creaturePlural(tierName, aliveCreatures().length)} ${aliveCreatures().length}/${CREATURES_PER_LEVEL}`
          );
          levelHud.setText(`Nivel ${currentLevel}/${DUNGEON_LEVELS} | Escalera en (${STAIRS_TILE.gx},${STAIRS_TILE.gy})`);
        };
        const pickCreatureDamage = () => {
          const max = Math.max(1, Number(this._activeAttackerMaxDamage || 1));
          return Phaser.Math.Between(1, max);
        };
        const showPlayerHitEffect = (dmg) => {
          if (playerDead) return;
          player.setTint(0xff4d4d);
          this.tweens.add({
            targets: player,
            scaleX: basePlayerScaleX * 1.1,
            scaleY: basePlayerScaleY * 1.1,
            yoyo: true,
            duration: 80,
            ease: 'Sine.easeOut',
            onComplete: () => {
              if (!playerDead) {
                player.setScale(basePlayerScaleX, basePlayerScaleY);
              }
              player.clearTint();
              updatePlayerBar();
            },
          });
          const pop = this.add.text(player.x, player.y - tileSize * 0.65, `-${dmg}`, {
            color: '#ff7b7b',
            fontSize: '16px',
            fontStyle: 'bold',
          });
          pop.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: pop,
            y: pop.y - 18,
            alpha: 0,
            duration: 350,
            ease: 'Sine.easeOut',
            onComplete: () => pop.destroy(),
          });
        };
        const showCreatureHitEffect = (creature, dmg) => {
          creature.sprite.setTint(0xff4d4d);
          this.tweens.add({
            targets: creature.sprite,
            scaleX: creature.sprite.scaleX * 1.1,
            scaleY: creature.sprite.scaleY * 1.1,
            yoyo: true,
            duration: 80,
            ease: 'Sine.easeOut',
            onComplete: () => {
              creature.sprite.clearTint();
              creature.sprite.setDisplaySize(tileSize * 0.9, tileSize * 0.9);
              updateCreatureBar(creature);
            },
          });
          const pop = this.add.text(creature.sprite.x, creature.sprite.y - tileSize * 0.65, `-${dmg}`, {
            color: '#ff7b7b',
            fontSize: '16px',
            fontStyle: 'bold',
          });
          pop.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: pop,
            y: pop.y - 16,
            alpha: 0,
            duration: 320,
            ease: 'Sine.easeOut',
            onComplete: () => pop.destroy(),
          });
        };
        const tileKey = (x, y) => `${x},${y}`;
        const findNextStepToPlayer = (fromX, fromY) => {
          const targetKey = tileKey(gridX, gridY);
          const startKey = tileKey(fromX, fromY);
          if (startKey === targetKey) return null;

          const queue = [{ x: fromX, y: fromY }];
          const visited = new Set([startKey]);
          const prev = new Map();
          const directions = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
          ];

          while (queue.length > 0) {
            const cur = queue.shift();
            for (const d of directions) {
              const nx = cur.x + d.x;
              const ny = cur.y + d.y;
              const key = tileKey(nx, ny);
              if (visited.has(key)) continue;
              if (!isWalkable(nx, ny)) continue;
              if (key !== targetKey && isOccupiedByActor(nx, ny)) continue;

              visited.add(key);
              prev.set(key, cur);
              if (key === targetKey) {
                let step = { x: nx, y: ny };
                let stepPrev = prev.get(key);
                while (stepPrev && tileKey(stepPrev.x, stepPrev.y) !== startKey) {
                  step = stepPrev;
                  stepPrev = prev.get(tileKey(stepPrev.x, stepPrev.y));
                }
                return step;
              }
              queue.push({ x: nx, y: ny });
            }
          }
          return null;
        };
        const tryMoveCreature = (creature) => {
          const next = findNextStepToPlayer(creature.gx, creature.gy);
          if (!next) return;
          if (next.x === gridX && next.y === gridY) return;
          orientCreatureSprite(creature, next.x - creature.gx, next.y - creature.gy);
          creature.gx = next.x;
          creature.gy = next.y;
          creature.sprite.x = centerX(creature.gx);
          creature.sprite.y = centerY(creature.gy);
          updateCreatureBar(creature);
        };
        const tryWanderCreature = (creature, now) => {
          if (now < creature.nextWanderAt) return;
          creature.nextWanderAt = now + Phaser.Math.Between(900, 1600);

          // Fuera de agro: solo movimiento cardinal de 1 casilla (N/E/O/S).
          const cardinalDirections = [
            { dx: 0, dy: -1 }, // norte
            { dx: 1, dy: 0 },  // este
            { dx: -1, dy: 0 }, // oeste
            { dx: 0, dy: 1 },  // sur
          ];
          const firstIndex = Phaser.Math.Between(0, cardinalDirections.length - 1);
          for (let i = 0; i < cardinalDirections.length; i += 1) {
            const d = cardinalDirections[(firstIndex + i) % cardinalDirections.length];
            const nx = creature.gx + d.dx;
            const ny = creature.gy + d.dy;
            if (!isWalkable(nx, ny)) continue;
            if (isOccupiedByActor(nx, ny)) continue;
            orientCreatureSprite(creature, d.dx, d.dy);
            creature.gx = nx;
            creature.gy = ny;
            creature.sprite.x = centerX(creature.gx);
            creature.sprite.y = centerY(creature.gy);
            updateCreatureBar(creature);
            return;
          }
        };
        const creatureTurn = () => {
          if (gameOver) return;
          const now = this.time.now;
          for (const creature of aliveCreatures()) {
            if (!hasAggro(creature)) {
              tryWanderCreature(creature, now);
              continue;
            }
            creature.aggroLocked = true;
            if (!isAdjacent(creature.gx, creature.gy, gridX, gridY)) {
              tryMoveCreature(creature);
            }
            if (isAdjacent(creature.gx, creature.gy, gridX, gridY)) {
              orientCreatureSprite(creature, gridX - creature.gx, gridY - creature.gy);
              this._activeAttackerMaxDamage = creature.maxDamage;
              const dmg = pickCreatureDamage();
              playerHp = Math.max(0, playerHp - dmg);
              showPlayerHitEffect(dmg);
              combatLog.setText(`${creature.title} te golpea por ${dmg}.`);
              if (playerHp <= 0) {
                gameOver = true;
                playerDead = true;
                this.tweens.killTweensOf(player);
                const deathKey = deathTextureName(configPlayer.sex === 'female' ? 'female' : 'male');
                player.setTexture(deathKey);
                player.setAngle(0);
                player.setFlipX(false);
                player.setFlipY(false);
                player.setScale(1, 1);
                player.setDisplaySize(tileSize, tileSize);
                deathCaption.setPosition(player.x, player.y + tileSize * 0.72);
                deathCaption.setVisible(true);
                combatLog.setText('Has muerto. Recarga para reiniciar.');
                break;
              }
            }
          }
          updatePlayerBar();
          updateHud();
        };

        spawnCreaturesForLevel(currentLevel);
        updatePlayerBar();
        updateHud();
        this.time.addEvent({
          delay: 280,
          loop: true,
          callback: creatureTurn,
        });

        this.events.on('update', () => {
          updateAllHealthBars();
          if (moving || gameOver) return;

          let dx = 0;
          let dy = 0;
          let frame = null;
          const ctrlPressed = ctrlKey.isDown;

          if (cursors.left.isDown || keys.A.isDown) {
            dx = -1;
            frame = 3; // oeste
          } else if (cursors.right.isDown || keys.D.isDown) {
            dx = 1;
            frame = 1; // este
          } else if (cursors.up.isDown || keys.W.isDown) {
            dy = -1;
            frame = 2; // norte
          } else if (cursors.down.isDown || keys.S.isDown) {
            dy = 1;
            frame = 0; // sur
          }

          if (frame !== null) {
            player.setTexture(frameTextureName(configPlayer.sex, frame));
          }

          if (dx === 0 && dy === 0) return;
          if (ctrlPressed && (cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown)) {
            return;
          }

          const targetGX = gridX + dx;
          const targetGY = gridY + dy;
          if (!isWalkable(targetGX, targetGY)) {
            return;
          }

          const targetCreature = creatureAt(targetGX, targetGY);
          if (targetCreature) {
            targetCreature.hp = Math.max(0, targetCreature.hp - playerDamage);
            showCreatureHitEffect(targetCreature, playerDamage);
            if (targetCreature.hp <= 0) {
              targetCreature.alive = false;
              targetCreature.sprite.setVisible(false);
              updateCreatureBar(targetCreature);
              combatLog.setText(`Golpeas a ${targetCreature.title} y muere.`);
            } else {
              combatLog.setText(
                `Golpeas a ${targetCreature.title} por ${playerDamage} (${targetCreature.hp} HP).`
              );
            }
            updateCreatureBar(targetCreature);
            updateHud();
            if (aliveCreatures().length === 0) {
              combatLog.setText(
                `Has derrotado a todas las criaturas del nivel ${currentLevel}. Baja por la escalera.`
              );
              return;
            }
            return;
          }

          moving = true;
          gridX = targetGX;
          gridY = targetGY;
          this.tweens.add({
            targets: player,
            x: centerX(gridX),
            y: centerY(gridY),
            duration: stepDurationMs,
            ease: 'Linear',
            onComplete: () => {
              // Asegura alineacion exacta al centro de la casilla.
              player.x = centerX(gridX);
              player.y = centerY(gridY);
              player.setOrigin(0.5, 0.5);
              moving = false;
              if (hasStairsAtPlayer()) {
                descendLevel();
              }
              updateHud();
            },
          });
        });
      },
    },
  });
}

setupSelectorUI();

async function loadProgressionDatabase() {
  if (progressionTiers.length > 0) return;
  progressionTiers = await getCreatureProgressionByExperience(DUNGEON_LEVELS, CREATURE_POOL_PER_LEVEL);
  if (progressionTiers.length === 0) {
    progressionTiers = [{
      level: 1,
      creatures: [{ id: 1116, title: 'Rat', experience: 5, hitpoints: 20, maxDamage: 8, image: 'creature/Rat.gif' }],
    }];
  }
}
