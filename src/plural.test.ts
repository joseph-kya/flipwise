import { expect, it } from 'vitest';
import { plural } from './plural';
it('pluralises counts', () => {
  expect(plural(1, 'lecture')).toBe('1 lecture');
  expect(plural(2, 'card')).toBe('2 cards');
  expect(plural(0, 'review')).toBe('0 reviews');
  expect(plural(1, 'leech', 'leeches')).toBe('1 leech');
  expect(plural(1234, 'card')).toBe((1234).toLocaleString() + ' cards');
});
