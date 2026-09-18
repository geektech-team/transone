import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

const outDir = resolve(import.meta.dir, '..', 'dist');
const port = Number(process.env.PORT ?? 52314);

if (!existsSync(outDir)) {
  console.error(
    `未找到构建产物 ${outDir}。请先运行：bun run --cwd packages/transone-cli/docs build:web`
  );
  process.exit(1);
}

// 从产物 index.html 读取部署 base（--base 构建产物为 /transone/cli 等），
// 让 preview 与 GitHub Pages 的部署形态一致：站点挂在 base 子路径下。
const indexHtml = readFileSync(join(outDir, 'index.html'), 'utf-8');
const baseMatch = indexHtml.match(/data-doc-base="([^"]+)"/);
const base = baseMatch ? baseMatch[1] : '';

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    if (base) {
      if (pathname === '/') {
        return new Response(null, { status: 302, headers: { Location: `${base}/` } });
      }
      if (pathname !== base && !pathname.startsWith(`${base}/`)) {
        return new Response('Not Found', { status: 404 });
      }
    }

    let rel =
      pathname === '/' ? '/index.html' : pathname.slice(base.length) || '/index.html';
    let target = normalize(join(outDir, rel));
    if (!target.startsWith(outDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    // directoryPages 多页形态：目录路径回退到目录内 index.html
    // （兼容带/不带尾斜杠两种形态，行为对齐 GitHub Pages）
    if (existsSync(target) && statSync(target).isDirectory()) {
      target = normalize(join(target, 'index.html'));
    }

    const file = Bun.file(target);
    if (existsSync(target) && file.size > 0) {
      return new Response(file);
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(
  `TransOne CLI docs preview server: http://localhost:${server.port}${base ? ` (base ${base})` : ''}`
);
