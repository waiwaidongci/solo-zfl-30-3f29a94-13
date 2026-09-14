import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// 离线/无 root 环境：Chromium 的运行库与中文字体可能装在用户目录下（见 README「无 root 部署」）。
const localLibs = [
  "/tmp/rootfs/usr/lib/aarch64-linux-gnu",
  "/tmp/rootfs/lib/aarch64-linux-gnu",
  "/tmp/rootfs/usr/lib/x86_64-linux-gnu",
  "/tmp/rootfs/lib/x86_64-linux-gnu",
].filter(existsSync);
const env = { ...process.env };
if (localLibs.length) env.LD_LIBRARY_PATH = [...localLibs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8123",
    actionTimeout: 5000,
    launchOptions: { env },
  },
  webServer: {
    command: "node tools/server.mjs 8123",
    url: "http://127.0.0.1:8123/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
