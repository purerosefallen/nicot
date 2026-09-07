import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    decorator: {
      legacy: true,
      emitDecoratorMetadata: true,
    },
    assumptions: {
      setPublicClassFields: true,
    },
    typescript: {
      removeClassFieldsWithoutInitializer: true,
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['tests/**/*.spec.ts'],
    fileParallelism: false,
    setupFiles: ['reflect-metadata'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
