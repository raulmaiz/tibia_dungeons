export function isBlockedSpellTitle(titleRaw) {
  const title = String(titleRaw || '').trim().toLowerCase();
  return title === 'find person' || title === 'cure poison';
}
