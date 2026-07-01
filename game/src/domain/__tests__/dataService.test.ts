import { describe, expect, it } from 'vitest';
import { templateFromRows } from '../../data/dataService';

const row = {
  article_id: 1150,
  title: 'Vampire',
  hitpoints: 475,
  experience: 305,
  speed: 119,
  runs_at: 0,
  type_primary: 'Vampires',
};

describe('templateFromRows', () => {
  it('merges a catalog row with its max damage', () => {
    expect(templateFromRows(row, 400)).toEqual({
      id: 1150,
      title: 'Vampire',
      typePrimary: 'Vampires',
      experience: 305,
      hitpoints: 475,
      maxDamage: 400,
      speed: 119,
      runsAt: 0,
    });
  });

  it('falls back to the hand-tuned template stats when fields are missing', () => {
    // 1116 (Rat) has a fallback template with maxDamage 8.
    const t = templateFromRows(
      { article_id: 1116, title: 'Rat', hitpoints: null, experience: null, speed: null, runs_at: null, type_primary: null },
      null,
    );
    expect(t).not.toBeNull();
    expect(t!.hitpoints).toBe(20);
    expect(t!.maxDamage).toBe(8);
    expect(t!.speed).toBe(67);
  });

  it('rejects rows without id, title or any hitpoints source', () => {
    expect(templateFromRows({ ...row, title: '' }, 10)).toBeNull();
    expect(templateFromRows({ ...row, article_id: NaN }, 10)).toBeNull();
    expect(
      templateFromRows(
        { article_id: 999999, title: 'Ghost Data', hitpoints: null, experience: 1, speed: 70, runs_at: 0, type_primary: 'X' },
        50,
      ),
    ).toBeNull();
  });
});
