// Entry point. Two imports — that's it. The auth module renders the
// pre-game UI (login + character select); the engine module mounts the
// inventory panel which then boots the Phaser scene when the player
// clicks "Enter Dungeon".
import './ui/auth.js';
import './engine/game.engine.js';
