import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  defineConfig(viteConfig({ mode: "test", command: "serve", isSsrBuild: false, isPreview: false })),
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.spec.ts"],
      // Navegar para rotas carrega as telas reais (import dinâmico): o primeiro import a frio é lento.
      testTimeout: 30_000,
    },
  }),
);
