import { randomBytes, scryptSync } from "node:crypto";

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const DERIVED_KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const password = process.argv[2];

if (!password) {
  console.error("请提供需要生成哈希的密码。");
  process.exit(1);
}

const salt = randomBytes(SALT_LENGTH);
const hash = scryptSync(password, salt, DERIVED_KEY_LENGTH, {
  N: SCRYPT_COST,
  r: SCRYPT_BLOCK_SIZE,
  p: SCRYPT_PARALLELIZATION,
});

process.stdout.write(
  `${[
    "scrypt",
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$")}\n`,
);
