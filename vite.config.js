import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// Rock Lab's dev server, on a port of its own (strictPort: it never
// quietly takes another one).

// Stills, on the dev server only: the page posts a picture of itself
// (window.rocklab.still('name') in src/main.js) and it's saved as
// .scratch/stills/name.png, a folder kept out of git. For looking at the
// page when its window isn't on screen.
const STILLS = path.resolve('.scratch/stills');
const MOST = 12 * 1024 * 1024; // bytes
const stills = {
  name: 'rocklab-stills',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__still', (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 405;
        response.end();
        return;
      }
      const asked = new URL(request.url, 'http://localhost').searchParams.get('name') ?? '';
      const name = asked.replace(/[^a-z0-9-]/gi, '').slice(0, 48) || 'still';
      const chunks = [];
      let size = 0;
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MOST) chunks.push(chunk);
      });
      request.on('end', () => {
        if (size > MOST) {
          response.statusCode = 413;
          response.end();
          return;
        }
        mkdirSync(STILLS, { recursive: true });
        writeFileSync(path.join(STILLS, `${name}.png`), Buffer.concat(chunks));
        response.end(`${name}.png`);
      });
    });
  },
};

// A copy on a website (`npm run build:site`, vite's "site" mode) loads that
// site's own visit counter (/assets/analytics.js, no cookies), and nothing
// else changes. Rock Lab itself, and any other build of it, loads nothing
// from anywhere.
const siteAnalytics = {
  name: 'rocklab-site-analytics',
  transformIndexHtml: () => [{ tag: 'script', attrs: { src: '/assets/analytics.js', defer: true }, injectTo: 'body' }],
};

// Which Rock Lab a build is (src/version.js shows it beside the name): its
// version (package.json's), the day, whether it's the dev server, and the
// git commit it was made from if this is a checkout (a downloaded copy has
// none). A build made for a website (`--mode site`) carries no commit: its
// version and its day say which it is.
const buildOf = (mode, dev) => {
  const build = { version: JSON.parse(readFileSync('package.json', 'utf8')).version, date: new Date().toISOString().slice(0, 10), dev };
  if (mode === 'site') return build;
  try {
    const git = (args) => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { ...build, hash: git('rev-parse --short HEAD'), changed: git('status --porcelain').length > 0 };
  } catch {
    return build;
  }
};

export default defineConfig(({ mode, command }) => ({
  define: { __ROCKLAB__: JSON.stringify(buildOf(mode, command === 'serve')) },
  plugins: mode === 'site' ? [stills, siteAnalytics] : [stills],
  base: './',
  resolve: { dedupe: ['three'] },
  build: { chunkSizeWarningLimit: 1000 }, // (kB: one page, three.js and all)
  server: { port: 5211, strictPort: true },
}));
