import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const HASH_PREFIX = "scrypt-v1";

const deriveKey = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) =>
        error ? reject(error) : resolve(derivedKey as Buffer),
    );
  });

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);
  return [
    HASH_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
};

export const verifyPassword = async (
  password: string,
  encodedHash: string,
): Promise<boolean> => {
  const [prefix, cost, blockSize, parallelization, saltValue, hashValue] =
    encodedHash.split("$");

  if (
    prefix !== HASH_PREFIX ||
    Number(cost) !== SCRYPT_COST ||
    Number(blockSize) !== SCRYPT_BLOCK_SIZE ||
    Number(parallelization) !== SCRYPT_PARALLELIZATION ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  const expected = Buffer.from(hashValue, "base64url");
  if (expected.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }

  const actual = await deriveKey(password, Buffer.from(saltValue, "base64url"));
  return timingSafeEqual(actual, expected);
};

export const createSessionToken = (): string =>
  randomBytes(32).toString("base64url");

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");
