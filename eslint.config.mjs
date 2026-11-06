import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated artifacts (next-pwa output, Playwright output)
    'public/sw.js',
    'public/worker-*.js',
    'public/workbox-*.js',
    'playwright-report/**',
    'test-results/**',
  ]),
]);

export default eslintConfig;
