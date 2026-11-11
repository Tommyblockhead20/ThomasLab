import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5174, strictPort: true },
  build: {
    outDir: '../Titanic',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom/client'],
          network: ['socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 650,
  },
});
