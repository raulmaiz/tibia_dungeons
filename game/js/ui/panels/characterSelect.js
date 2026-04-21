// Character-select UI: sex / class buttons + name input focus.
// Writes to panelState.selectedSex + panelState.selectedClass. The actual
// boot trigger ("Enter Dungeon" button) is wired in bootFlow.js so this
// module stays focused on the selection UI.

import { panelState } from './state.js';

export function setupCharacterSelect() {
  const choiceMale = document.getElementById('choiceMale');
  const choiceFemale = document.getElementById('choiceFemale');
  const classKnight = document.getElementById('classKnight');
  const classPaladin = document.getElementById('classPaladin');
  const classSorcerer = document.getElementById('classSorcerer');
  const classDruid = document.getElementById('classDruid');
  const playerNameInput = document.getElementById('playerName');
  if (playerNameInput) playerNameInput.focus();

  const setChoice = (sex) => {
    panelState.selectedSex = sex;
    if (choiceMale)   choiceMale.classList.toggle('active',   sex === 'male');
    if (choiceFemale) choiceFemale.classList.toggle('active', sex === 'female');
  };

  const setClassChoice = (classKey) => {
    panelState.selectedClass = classKey;
    if (classKnight)   classKnight.classList.toggle('active',   classKey === 'knight');
    if (classPaladin)  classPaladin.classList.toggle('active',  classKey === 'paladin');
    if (classSorcerer) classSorcerer.classList.toggle('active', classKey === 'sorcerer');
    if (classDruid)    classDruid.classList.toggle('active',    classKey === 'druid');
  };

  if (choiceMale)    choiceMale.addEventListener('click',    () => setChoice('male'));
  if (choiceFemale)  choiceFemale.addEventListener('click',  () => setChoice('female'));
  if (classKnight)   classKnight.addEventListener('click',   () => setClassChoice('knight'));
  if (classPaladin)  classPaladin.addEventListener('click',  () => setClassChoice('paladin'));
  if (classSorcerer) classSorcerer.addEventListener('click', () => setClassChoice('sorcerer'));
  if (classDruid)    classDruid.addEventListener('click',    () => setClassChoice('druid'));
}
