// `vitest/config` rather than `vite`: it re-exports Vite's own defineConfig widened with
// the `test` block below, which Vite's type does not know about. Dev-only either way —
// the production build never evaluates the test config.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // Listen on every interface (0.0.0.0 + ::) so the dev server is reachable from other
    // devices on the LAN / a Tailscale tailnet, not just from localhost. Port is left at
    // Vite's default (5173); nothing here pins it.
    host: true,
    // Vite rejects requests whose Host header is neither localhost nor an IP address.
    // Tailscale IPs (100.x.y.z) pass on their own; MagicDNS names do not, so allow the
    // tailnet suffix explicitly (leading dot = the domain and all its subdomains).
    allowedHosts: ['.ts.net'],
    proxy: {
      // Server-side hop inside the dev server: stays on loopback even when `host` is open.
      '/api': 'http://127.0.0.1:8001',
    },
  },
  preview: {
    // Same reasoning for `vite preview` (serves the built SPA from dist/).
    host: true,
    allowedHosts: ['.ts.net'],
  },
  test: {
    // `node`, not jsdom: everything under test is pure logic in src/lib and src/i18n. The
    // panel ships no component-test infrastructure (see AGENTS.md), and a DOM environment
    // would cost startup time on every run for nothing — the two suites that touch the DOM
    // stub `document` themselves.
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      // Only what the suites actually target. Screens and components are excluded because
      // nothing tests them, and counting them would report a number that says more about
      // the missing infrastructure than about the code that IS covered.
      include: ['src/lib/**/*.ts', 'src/i18n/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/i18n/en.ts', 'src/i18n/es.ts'],
    },
  },
});
