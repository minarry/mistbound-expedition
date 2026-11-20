import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5173, strictPort: true, fs: { allow: ['.'], deny: ['**/.env*', '**/*.{crt,pem}', '**/.git/**', '**/.local/**', '**/server/**'] }, watch: { ignored: ['**/.local/**', '**/e2e/**', '**/atelier/reviews/**', '**/*.import'] } },
});
