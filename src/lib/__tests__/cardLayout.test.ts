import { describe, expect, it } from 'vitest';
import { moveItem, nextSize, resolveLayout, toSaved, type CardSpec } from '../cardLayout';

const specs: CardSpec[] = [
  { id: 'total', sizes: ['small', 'wide'], defaultSize: 'small' },
  { id: 'cycle', sizes: ['small', 'wide'], defaultSize: 'small' },
  { id: 'banks', sizes: ['wide', 'large'], defaultSize: 'wide' },
  { id: 'trend', sizes: ['wide'], defaultSize: 'wide', defaultHidden: true },
];

describe('card layouts', () => {
  it('uses the defaults when nothing is saved', () => {
    const l = resolveLayout(specs, null);
    expect(l.visible).toEqual([
      { id: 'total', size: 'small' }, { id: 'cycle', size: 'small' }, { id: 'banks', size: 'wide' },
    ]);
    expect(l.hidden).toEqual(['trend']);
  });

  it('keeps the order, sizes and hidden cards you chose', () => {
    const saved = { order: ['banks', 'total', 'cycle', 'trend'], sizes: { banks: 'large' as const, total: 'wide' as const }, hidden: ['cycle'] };
    const l = resolveLayout(specs, saved);
    expect(l.visible).toEqual([
      { id: 'banks', size: 'large' }, { id: 'total', size: 'wide' }, { id: 'trend', size: 'wide' },
    ]);
    expect(l.hidden).toEqual(['cycle']);
  });

  it('adds a card from a newer app version at the end, and drops ones that no longer exist', () => {
    const saved = { order: ['cycle', 'gone', 'total'], sizes: {}, hidden: [] };
    const l = resolveLayout(specs, saved);
    expect(l.visible.map(c => c.id)).toEqual(['cycle', 'total', 'banks']);
    expect(l.hidden).toEqual(['trend']);
  });

  it('falls back to the default size when a saved size is not allowed', () => {
    const l = resolveLayout(specs, { order: ['banks'], sizes: { banks: 'small' }, hidden: [] });
    expect(l.visible.find(c => c.id === 'banks')?.size).toBe('wide');
  });

  it('saves and loads back to the same layout', () => {
    const l = resolveLayout(specs, null);
    expect(resolveLayout(specs, toSaved(l))).toEqual(l);
  });

  it('steps through sizes and wraps around', () => {
    expect(nextSize(specs[2], 'wide')).toBe('large');
    expect(nextSize(specs[2], 'large')).toBe('wide');
  });

  it('moves one card without changing the rest', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});
