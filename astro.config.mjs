import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// 纯静态输出到 dist/；functions/ 仍由 Cloudflare Pages 单独构建
export default defineConfig({
  integrations: [svelte()],
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  server: { port: 8788 },
});
