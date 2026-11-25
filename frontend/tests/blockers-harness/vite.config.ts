import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const here=path.resolve(__dirname);
export default defineConfig({root:here,plugins:[{name:'qa-contexts',enforce:'pre',resolveId(source){if(source.endsWith('/StoreIdentityContext'))return path.join(here,'identity.tsx');if(source.endsWith('/AdminContext'))return path.join(here,'admin.tsx');}},react()],server:{host:'127.0.0.1',port:5198,strictPort:true,fs:{allow:[path.resolve(here,'../..')]}}});
