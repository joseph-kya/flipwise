import { describe, expect, it } from 'vitest';
import { formatGap, goodChain, ratingOutcomes, shortGap } from './fsrsDemo';

describe('explainer numbers come from the real scheduler', () => {
  it('gaps stretch every time a card is answered Good', () => {
    const gaps = goodChain(5);
    expect(gaps.map(shortGap)).toEqual(['10m', '2d', '11d', '7w', '5mo']);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });
  it('ratings order the next gap Again < Hard < Good < Easy', () => {
    const r = ratingOutcomes();
    expect(r.again).toBeLessThan(r.hard);
    expect(r.hard).toBeLessThan(r.good);
    expect(r.good).toBeLessThan(r.easy);
    expect(formatGap(r.again)).toBe('10 min');
    expect(formatGap(r.good)).toBe('7 weeks');
  });
});
