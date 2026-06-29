import { scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_HASH_PART_COUNT = 6;
const DERIVED_KEY_LENGTH = 32;

interface ParsedScryptHash {
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  expectedHash: Buffer;
}

function parseScryptHash(passwordHash: string): ParsedScryptHash | null {
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, hashText] =
    passwordHash.split("$");

  if (
    algorithm !== "scrypt" ||
    !costText ||
    !blockSizeText ||
    !parallelizationText ||
    !saltText ||
    !hashText ||
    passwordHash.split("$").length !== SCRYPT_HASH_PART_COUNT
  ) {
    return null;
  }

  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);

  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    cost <= 0 ||
    blockSize <= 0 ||
    parallelization <= 0
  ) {
    return null;
  }

  return {
    cost,
    blockSize,
    parallelization,
    salt: Buffer.from(saltText, "base64url"),
    expectedHash: Buffer.from(hashText, "base64url"),
  };
}

function deriveScryptKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function verifyPasswordHash(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const parsedHash = parseScryptHash(passwordHash);

  if (!parsedHash) {
    return false;
  }

  try {
    const derivedKey = await deriveScryptKey(password, parsedHash.salt, DERIVED_KEY_LENGTH, {
      N: parsedHash.cost,
      r: parsedHash.blockSize,
      p: parsedHash.parallelization,
    });

    if (derivedKey.length !== parsedHash.expectedHash.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, parsedHash.expectedHash);
  } catch {
    return false;
  }
}
