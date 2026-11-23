import { defineConfig } from 'vitest/config';
// Emulator-backed integration tests; run with `npm run test:emulator` (not part of `npm test`).
export default defineConfig({
  test: { include: ['src/**/*.emulator.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000 },
});
