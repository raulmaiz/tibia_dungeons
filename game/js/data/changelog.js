/**
 * Changelog — human-readable release notes shown on the loading screen.
 * Add a new entry at the TOP for each release.
 * Keep entries short (1 line), max ~80 chars.
 */
export const CHANGELOG = [
  {
    version: '0.2.0',
    date: '2026-04-17',
    entries: [
      'Versión mobile y tablet: layout responsive, sidebar escalado',
      'Joystick virtual táctil para mover el personaje en mobile/tablet',
      'Hotkeys de consumibles: [F] Comida, [G] Poción Mana, [H] Poción Vida',
      'Barra de hotkeys: click/toque para activar hechizos y consumibles',
      'Loot bag táctil: tooltip con botones Equipar/Usar y Vender',
      'Zoom slider en Game Settings para ajustar tamaño del juego',
      'Indicador de combate (⚔) en el panel de debuffs al entrar en aggro',
      'Indicador CAP con progresión de color blanco→rojo según capacidad',
      'CAP y peso de items mostrados en el Market',
      'Market: mensajes de error visibles (oro, capacidad, bag llena)',
      'Market: compra x10/x100 inteligente — compra lo que puedas cargar',
      'Spell: Convince Creature — convence criaturas para que luchen contigo',
      'Spell: Summon Creature — invoca la mejor criatura que puedas pagar',
      'Spell: Heal Friend — cura al aliado con menos HP',
      'Spell: Mass Healing — cura al jugador y todos sus aliados',
      'Spells Party: Heal/Train/Enchant/Protect/Enlighten afectan aliados',
      'Spell: Challenge — provoca aggro de criaturas cercanas',
      'Sorcerer: +25% de daño mágico en hechizos de ataque',
      'Aliados: tinte verde, barra de vida verde, siguen entre floors',
      'Monstruos atacan a tus aliados si están adyacentes',
      'Las invocaciones mueren con su criatura invocadora',
      'Distance Weapons: disparo automático mientras te mueves',
      'Floors 21+: entre 1 y 100 criaturas aleatorias por floor',
      'Fix: Find Fiend oculta de la Spell Shop',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-04-15',
    entries: [
      'Sistema de versionado automático al hacer push y al desplegar',
      'Pantalla de carga: animación dinámica con el historial de cambios',
      'Fix: criaturas ya no atacan fuera de su rango al entrar en modo huida',
      'Refactor: campo ranged en creature.json ahora es booleano (true/false)',
    ],
  },
  {
    version: '0.0.0',
    date: '2026-04-15',
    entries: [
      'Nuevo slot de equipamiento: fuente de luz (antorchas, lámparas, etc.)',
      'Rediseño completo de los paneles de Equipamiento y Loot Bag',
      'Ranura de equipamiento: efecto brillante al equipar items',
      'Indicador de hambre con animación de pulso rojo/verde',
      'Tooltip de items del loot ahora aparece a la izquierda del objeto',
      'Tooltip compacto: tipo de item abreviado, precio en dorado',
      'Panel de Items Shop: cierre automático al hacer clic fuera',
      'Botón "Comprar" del Items Shop con el mismo estilo verde que las magias',
      'Slot 0 añadido a la barra de hechizos (tecla 0 / Numpad 0)',
      'Panel "Learned Spells" rediseñado con drag & drop para reordenar',
      'Top Stats muestra todos los atributos sin límite de filas',
      'Animación de casteo y cooldown visual en la barra de hechizos',
      'Tooltip unificado para magias, items shop y loot bag',
      'Nombres de criaturas corregidos en los 20 pisos de la mazmorra',
      'HUD corregido: skill de arma y escudo según equipamiento real',
      'Rediseño del panel de Comprar Magias (spell shop)',
    ],
  },
];
