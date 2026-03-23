import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'workspace',
      environment: 'node',
      include: ['tests/**/*.test.mjs'],
      passWithNoTests: true,
    },
  },
]);
