import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      STORE_KEY: "kilometro",
      DB_PATH: ":memory:",
      TRUSTED_PLATFORM_PROFILES: "https://encargo.test/.well-known/ucp",
      ADMIN_TOKEN: "test-admin",
    },
  },
});
