import { scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyPasswordHash } from "@/modules/auth/password";

function createTestHash(password: string, salt: string): string {
  const cost = 16384;
  const blockSize = 8;
  const parallelization = 1;
  const derivedKey = scryptSync(password, salt, 32, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });

  return [
    "scrypt",
    String(cost),
    String(blockSize),
    String(parallelization),
    Buffer.from(salt).toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

describe("password hash", () => {
  it("verifies a correct scrypt password hash", async () => {
    const hash = createTestHash("correct-password", "unit-test-salt");

    await expect(verifyPasswordHash("correct-password", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password without exposing enum details", async () => {
    const hash = createTestHash("correct-password", "unit-test-salt");

    await expect(verifyPasswordHash("wrong-password", hash)).resolves.toBe(false);
  });

  it("rejects an unsupported hash format safely", async () => {
    await expect(verifyPasswordHash("correct-password", "sha256$bad-hash")).resolves.toBe(false);
  });

  it("generates a scrypt hash without printing the plaintext password", () => {
    const scriptPath = join(process.cwd(), "scripts", "hash-password.ts");
    const result = spawnSync(process.execPath, [scriptPath, "demo-password"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toMatch(/^scrypt\$/);
    expect(result.stdout).not.toContain("demo-password");
  });
});
