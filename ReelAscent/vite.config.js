import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs keep the build portable across GitHub Pages subdirectories.
  base: './',
  build: {
    target: 'es2022'
  }
});
