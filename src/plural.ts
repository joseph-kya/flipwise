/** "1 card", "2 cards", "1,234 reviews". Pass `many` for irregular plurals. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}
