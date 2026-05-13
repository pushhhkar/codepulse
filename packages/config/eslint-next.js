import { nextConfig } from 'eslint-config-next/flat.js';
import baseConfig from './eslint.js';

/** @type {import("typescript-eslint").Config} */
export default [
  ...baseConfig,
  ...nextConfig,
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'error',
    },
  },
];
