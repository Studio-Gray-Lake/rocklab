import { mkdirSync, writeFileSync } from 'node:fs';
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

export default defineConfig({
  plugins: [stills],
  base: './',
  resolve: { dedupe: ['three'] },
  build: { chunkSizeWarningLimit: 1000 }, // (kB: one page, three.js and all)
  server: { port: 5211, strictPort: true },
});
