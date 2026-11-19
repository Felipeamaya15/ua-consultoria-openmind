
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = path.resolve(root, '..').toLowerCase();
const output = process.env.SCRUM521_QA_OUTPUT && path.resolve(process.env.SCRUM521_QA_OUTPUT);
if (!output || output.toLowerCase() === repository || output.toLowerCase().startsWith(repository + path.sep)) {
  throw new Error('Define SCRUM521_QA_OUTPUT fuera del repositorio.');
}
process.env.VITE_API_URL = 'http://127.0.0.1:8002';
const options = { root, configFile: false, plugins: [react(), tailwindcss()], cacheDir: path.join(output, 'vite-cache') };
if (process.argv[2] === 'build') {
  await build({ ...options, build: { outDir: path.join(output, 'build'), emptyOutDir: false } });
} else {
  const server = await createServer({ ...options, server: { host: '127.0.0.1', port: 5211, strictPort: true } });
  await server.listen();
  server.printUrls();
}
