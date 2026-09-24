// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import rehypeAguas from './src/lib/rehype-aguas.mjs';
import servirMedios from './src/lib/vite-medios.mjs';

export default defineConfig({
  site: 'https://www.aguasgrancanaria.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  integrations: [sitemap({ filter: (page) => !page.includes('/admin/') })],
  markdown: {
    smartypants: false,
    rehypePlugins: [rehypeAguas],
  },
  vite: {
    plugins: [tailwindcss(), servirMedios()],
    build: { chunkSizeWarningLimit: 900 },
  },
});
