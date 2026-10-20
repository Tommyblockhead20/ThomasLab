import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [{
    name: 'browser-map-patch-loader',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './map-editor-patch-loader.js' && importer?.replaceAll('\\', '/').endsWith('/src/world/mountain-v2.js')) {
        return fileURLToPath(new URL('./src/world/map-editor-patch-loader.browser.js', import.meta.url));
      }
      return null;
    }
  }],
  // Relative URLs keep the build portable across GitHub Pages subdirectories.
  base: './',
  build: {
    target: 'es2022',
    // The playable site lives at /BassCamp/; source stays in /ReelAscent/.
    outDir: '../BassCamp',
    emptyOutDir: true
  }
});
