import { defineConfig } from 'vite';
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
});
