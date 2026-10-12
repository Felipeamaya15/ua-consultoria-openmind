import { defineConfig } from 'vite';
import base from '../../vite.config';
export default defineConfig({ ...base, plugins: [...(base.plugins ?? []), {
  name: 'isolated-visual-review',
  transformIndexHtml(html: string) { return html.replace(/src="\/src\/main\.tsx[^\"]*"/, 'src="/tests/visual-review/fixture.ts"'); },
}], server: { ...base.server, host: '127.0.0.1', port: 5175, strictPort: true } });
