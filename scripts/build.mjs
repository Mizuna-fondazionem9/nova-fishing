// Construction de production : un bundle client (JS + CSS) et un bundle serveur.
// Usage : node scripts/build.mjs [--dev]
import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const dev = process.argv.includes('--dev');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/client', { recursive: true });

await build({
  entryPoints: ['packages/client/src/main.tsx'],
  bundle: true,
  outfile: 'dist/client/app.js',
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  minify: !dev,
  sourcemap: dev,
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
  logLevel: 'info',
});
cpSync('packages/client/index.html', 'dist/client/index.html');

await build({
  entryPoints: ['packages/server/src/index.ts'],
  bundle: true,
  outfile: 'dist/server/index.js',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // `pg` reste une dépendance installée par npm : elle n'est chargée que si DATABASE_URL est défini.
  external: ['pg'],
  sourcemap: true,
  logLevel: 'info',
});
cpSync('packages/server/migrations', 'dist/server/migrations', { recursive: true });
console.log('Build terminé : dist/client et dist/server');
