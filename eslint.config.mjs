import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create a compatibility instance to load legacy "extends" configs
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = defineConfig([
  // Load Next.js recommended configs via the compatibility helper
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // Use the globalIgnores helper to exclude build artifacts
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),

  // Optional: Re-add browser/node globals if you encounter 'undefined' errors
  {
    languageOptions: {
      globals: {
        // ...globals.browser, // Uncomment if needed (requires 'globals' package)
        // ...globals.node,
      },
    },
  },
]);

export default eslintConfig;
