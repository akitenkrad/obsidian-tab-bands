import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // 本物の obsidian は abstract class ばかりで実体を作れないため，
    // テストでは最小限のスタブに差し替える．
    alias: {
      obsidian: fileURLToPath(new URL("./test/obsidian-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
