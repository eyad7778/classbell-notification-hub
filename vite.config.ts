// @lovable.dev/vite-tanstack-config already includes tanstackStart, react, tailwindcss,
// tsconfig paths, and nitro (build-only) — do NOT add them manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Lovable pins its own target internally; this applies to external deployments.
  nitro: { preset: "vercel" },
  tanstackStart: {
    server: { entry: "server" },
  },
});
