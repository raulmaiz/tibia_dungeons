/**
 * Changelog — human-readable release notes shown on the loading screen.
 * Add a new entry at the TOP for each release.
 * Keep entries short (1 line), max ~80 chars.
 */
export const CHANGELOG = [
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
