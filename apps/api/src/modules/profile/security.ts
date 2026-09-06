import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;
const CURRENT_SCRYPT = {
  prefix: "scrypt-v2",
  cost: 32_768,
  blockSize: 8,
  parallelization: 3,
  maxmem: 64 * 1024 * 1024,
} as const;
const LEGACY_SCRYPT = {
  prefix: "scrypt-v1",
  cost: 16_384,
  blockSize: 8,
  parallelization: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

type ScryptParameters = typeof CURRENT_SCRYPT | typeof LEGACY_SCRYPT;

const deriveKey = (
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: parameters.maxmem,
      },
      (error, derivedKey) =>
        error ? reject(error) : resolve(derivedKey as Buffer),
    );
  });

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, CURRENT_SCRYPT);
  return [
    CURRENT_SCRYPT.prefix,
    CURRENT_SCRYPT.cost,
    CURRENT_SCRYPT.blockSize,
    CURRENT_SCRYPT.parallelization,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
};

export const verifyPassword = async (
  password: string,
  encodedHash: string,
): Promise<boolean> => {
  const parts = encodedHash.split("$");
  if (parts.length !== 6) return false;
  const [prefix, cost, blockSize, parallelization, saltValue, hashValue] =
    parts;
  const parameters = [CURRENT_SCRYPT, LEGACY_SCRYPT].find(
    (candidate) => candidate.prefix === prefix,
  );

  if (
    !parameters ||
    Number(cost) !== parameters.cost ||
    Number(blockSize) !== parameters.blockSize ||
    Number(parallelization) !== parameters.parallelization ||
    !saltValue ||
    !/^[A-Za-z0-9_-]{22}$/.test(saltValue) ||
    !hashValue ||
    !/^[A-Za-z0-9_-]{86}$/.test(hashValue)
  ) {
    return false;
  }

  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }

  const actual = await deriveKey(password, salt, parameters);
  return timingSafeEqual(actual, expected);
};

export const passwordHashNeedsUpgrade = (encodedHash: string): boolean =>
  !encodedHash.startsWith(`${CURRENT_SCRYPT.prefix}$`);

export const createSessionToken = (): string =>
  randomBytes(32).toString("base64url");

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

export const sessionRevocationTime = (createdAt: Date, now: Date): Date =>
  createdAt > now ? createdAt : now;
