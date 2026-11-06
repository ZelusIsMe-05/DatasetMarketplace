import { defineConfig, devices } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E2E thật: Next dev (3000) + backend FastAPI (8000) + Anvil (8545) phải đang chạy
 * (scripts\start-anvil.bat, scripts\deploy-local.bat, scripts\start-backend.bat, npm run dev).
 *
 * Micro giả của Chromium phát một bản ghi tiếng Việt THẬT (fixture của backend) để chạy luồng ghi âm + QC thật.
 * Thêm 2,6 giây im lặng ở đầu vì ứng dụng bỏ phần âm thanh trong lúc đếm ngược 3-2-1.
 */
const FIXTURE = join(__dirname, "..", "backend", "tests", "fixtures", "audio", "prompt01_namminh.wav");
const MIC = join(__dirname, "e2e", ".tmp", "mic.wav");

function buildMicWav() {
  if (!existsSync(FIXTURE)) return;
  const src = readFileSync(FIXTURE);
  let off = 12;
  let data: Buffer | null = null;
  while (off < src.length - 8) {
    const id = src.toString("ascii", off, off + 4);
    const size = src.readUInt32LE(off + 4);
    if (id === "data") data = src.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!data) return;
  const pad = Buffer.alloc(Math.round(16000 * 2.6) * 2);
  const pcm = Buffer.concat([pad, data, Buffer.alloc(16000 * 2 * 2)]);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24);
  h.writeUInt32LE(32000, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  mkdirSync(join(__dirname, "e2e", ".tmp"), { recursive: true });
  writeFileSync(MIC, Buffer.concat([h, pcm]));
}
buildMicWav();

export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "./e2e/.results",
  use: {
    // E2E_BASE_URL cho phép test bản production (next start) ở cổng khác
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["microphone", "clipboard-read", "clipboard-write"],
    locale: "vi-VN",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC}%noloop`],
        },
      },
    },
  ],
});
