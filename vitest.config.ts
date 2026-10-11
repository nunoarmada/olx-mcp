/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    target: 'node18'
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '**/*.d.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'tests/**',
        'src/index.ts', // Entry point file
        'coverage/**'
      ],
      // Flat keys: Vitest ignores a nested `global` block, which is how the
      // previous 80% target went unenforced. These are floors just under the
      // measured coverage, to be raised as coverage improves.
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 65,
        statements: 65
      }
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        useAtomics: true
      }
    },
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true
  }
});