import { existsSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

const outDir = resolve(import.meta.dir, '..', 'dist', 'web');
const port = Number(process.env.PORT ?? 52312);

if (!existsSync(outDir)) {
  console.error(
    `未找到构建产物 ${outDir}。请先运行：bun run --cwd playground/ui-demo build:web`
  );
  process.exit(1);
}

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') {
      pathname = '/index.html';
    }

    const target = normalize(join(outDir, pathname));
    if (!target.startsWith(outDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    const file = Bun.file(target);
    if (existsSync(target) && file.size > 0) {
      return new Response(file);
    }

    return new Response(Bun.file(join(outDir, 'index.html')));
  },
});

console.log(`TransOne UI demo preview server: http://localhost:${server.port}`);
