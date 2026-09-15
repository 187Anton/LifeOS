import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scrypt as deriveKeyCallback,
} from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { finished, pipeline } from "node:stream/promises";

import { createSqliteBackup, restoreSqliteBackup } from "./sqlite-backup.js";

interface EncryptedBackupHeader {
  formatVersion: 1;
  contentType: "application/vnd.lifeos.sqlite-backup-v1";
  encryption: {
    algorithm: "aes-256-gcm";
    iv: string;
    tagLength: 16;
  };
  keyDerivation: {
    algorithm: "scrypt";
    salt: string;
    N: 32768;
    r: 8;
    p: 3;
    keyLength: 32;
  };
}

const encryptedMagic = Buffer.from("LIFEOSB1", "ascii");
const payloadMagic = Buffer.from("LIFEPAY1", "ascii");
const lengthBytes = 4;
const fileSizeBytes = 8;
const authenticationTagLength = 16;
const maximumHeaderLength = 4096;
const maximumPathLength = 4096;
const maximumFileCount = 100_000;
const minimumPassphraseLength = 16;
const scryptParameters = {
  N: 32_768,
  r: 8,
  p: 3,
  keyLength: 32,
  maxmem: 128 * 1024 * 1024,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pathInfo = async (target: string) =>
  lstat(target).catch((error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  });

const safeRelativePath = (relativePath: string) => {
  const normalized = relativePath.split(path.sep).join("/");
  if (
    !normalized ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    normalized
      .split("/")
      .some((segment) => segment === ".." || segment === "." || segment === "")
  ) {
    throw new Error("Das verschlüsselte Backup enthält einen unsicheren Pfad.");
  }
  return normalized;
};

const listRegularFiles = async (
  root: string,
  current = root,
): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("Symbolische Links sind im Backup nicht erlaubt.");
    }
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(root, absolute)));
    } else if (entry.isFile()) {
      files.push(safeRelativePath(path.relative(root, absolute)));
    } else {
      throw new Error("Das Backup unterstützt nur reguläre Dateien.");
    }
  }
  return files;
};

const writeAll = async (
  file: Awaited<ReturnType<typeof open>>,
  value: Uint8Array,
) => {
  let offset = 0;
  while (offset < value.byteLength) {
    const { bytesWritten } = await file.write(
      value,
      offset,
      value.byteLength - offset,
    );
    if (bytesWritten === 0)
      throw new Error("Das Backup konnte nicht geschrieben werden.");
    offset += bytesWritten;
  }
};

const copyFileIntoHandle = async (
  sourcePath: string,
  destination: Awaited<ReturnType<typeof open>>,
) => {
  const source = await open(sourcePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let position = 0;
    while (true) {
      const { bytesRead } = await source.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;
      await writeAll(destination, buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await source.close();
  }
};

const packDirectory = async (sourceDirectory: string, payloadPath: string) => {
  const files = await listRegularFiles(sourceDirectory);
  if (files.length > maximumFileCount) {
    throw new Error("Das Backup enthält zu viele Dateien.");
  }
  const payload = await open(payloadPath, "wx", 0o600);
  try {
    await writeAll(payload, payloadMagic);
    const count = Buffer.alloc(lengthBytes);
    count.writeUInt32BE(files.length);
    await writeAll(payload, count);
    for (const relativePath of files) {
      const pathBytes = Buffer.from(relativePath, "utf8");
      if (pathBytes.length === 0 || pathBytes.length > maximumPathLength) {
        throw new Error("Ein Backup-Pfad ist zu lang.");
      }
      const sourcePath = path.join(sourceDirectory, ...relativePath.split("/"));
      const sourceInfo = await lstat(sourcePath);
      if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
        throw new Error("Das Backup unterstützt nur reguläre Dateien.");
      }
      const metadata = Buffer.alloc(lengthBytes + fileSizeBytes);
      metadata.writeUInt32BE(pathBytes.length, 0);
      metadata.writeBigUInt64BE(BigInt(sourceInfo.size), lengthBytes);
      await writeAll(payload, metadata);
      await writeAll(payload, pathBytes);
      await copyFileIntoHandle(sourcePath, payload);
    }
  } finally {
    await payload.close();
  }
};

const readExact = async (
  file: Awaited<ReturnType<typeof open>>,
  length: number,
  position: number,
) => {
  const result = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await file.read(
      result,
      offset,
      length - offset,
      position + offset,
    );
    if (bytesRead === 0) {
      throw new Error("Das verschlüsselte Backup ist unvollständig.");
    }
    offset += bytesRead;
  }
  return result;
};

const unpackPayload = async (
  payloadPath: string,
  destinationDirectory: string,
) => {
  const payload = await open(payloadPath, "r");
  const payloadInfo = await payload.stat();
  let position = 0;
  const seen = new Set<string>();
  try {
    const magic = await readExact(payload, payloadMagic.length, position);
    position += payloadMagic.length;
    if (!magic.equals(payloadMagic)) {
      throw new Error(
        "Das verschlüsselte Backup enthält kein kompatibles Nutzdatenformat.",
      );
    }
    const countBytes = await readExact(payload, lengthBytes, position);
    position += lengthBytes;
    const count = countBytes.readUInt32BE();
    if (count > maximumFileCount) {
      throw new Error("Das verschlüsselte Backup enthält zu viele Dateien.");
    }
    await mkdir(destinationDirectory, { mode: 0o700 });
    for (let index = 0; index < count; index += 1) {
      const metadata = await readExact(
        payload,
        lengthBytes + fileSizeBytes,
        position,
      );
      position += metadata.length;
      const pathLength = metadata.readUInt32BE(0);
      const fileSize = metadata.readBigUInt64BE(lengthBytes);
      if (pathLength === 0 || pathLength > maximumPathLength) {
        throw new Error(
          "Das verschlüsselte Backup enthält einen ungültigen Pfad.",
        );
      }
      if (fileSize > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Eine Datei im verschlüsselten Backup ist zu groß.");
      }
      const pathBytes = await readExact(payload, pathLength, position);
      position += pathLength;
      const relativePath = safeRelativePath(pathBytes.toString("utf8"));
      if (
        !Buffer.from(relativePath, "utf8").equals(pathBytes) ||
        seen.has(relativePath)
      ) {
        throw new Error(
          "Das verschlüsselte Backup enthält doppelte oder ungültige Pfade.",
        );
      }
      seen.add(relativePath);
      const remaining = payloadInfo.size - position;
      if (Number(fileSize) > remaining) {
        throw new Error("Das verschlüsselte Backup ist unvollständig.");
      }
      const targetPath = path.join(
        destinationDirectory,
        ...relativePath.split("/"),
      );
      await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
      const target = await open(targetPath, "wx", 0o600);
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      let copied = 0;
      try {
        while (copied < Number(fileSize)) {
          const length = Math.min(buffer.length, Number(fileSize) - copied);
          const chunk = await readExact(payload, length, position + copied);
          await writeAll(target, chunk);
          copied += length;
        }
      } finally {
        await target.close();
      }
      position += Number(fileSize);
    }
    if (position !== payloadInfo.size) {
      throw new Error(
        "Das verschlüsselte Backup enthält unerwartete Zusatzdaten.",
      );
    }
  } finally {
    await payload.close();
  }
};

const requirePassphrase = (passphrase: string) => {
  if (passphrase.length < minimumPassphraseLength) {
    throw new Error(
      `Die Backup-Passphrase muss mindestens ${minimumPassphraseLength} Zeichen lang sein.`,
    );
  }
};

const deriveEncryptionKey = async (passphrase: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    deriveKeyCallback(
      passphrase,
      salt,
      scryptParameters.keyLength,
      {
        N: scryptParameters.N,
        r: scryptParameters.r,
        p: scryptParameters.p,
        maxmem: scryptParameters.maxmem,
      },
      (error, key) => (error ? reject(error) : resolve(Buffer.from(key))),
    );
  });

const decodeBase64 = (value: unknown, expectedLength: number) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("Der Verschlüsselungsheader ist ungültig.");
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.length !== expectedLength ||
    decoded.toString("base64") !== value
  ) {
    throw new Error("Der Verschlüsselungsheader ist ungültig.");
  }
  return decoded;
};

const parseHeader = (headerBytes: Buffer) => {
  let value: unknown;
  try {
    value = JSON.parse(headerBytes.toString("utf8"));
  } catch {
    throw new Error("Der Verschlüsselungsheader ist ungültig.");
  }
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    value.contentType !== "application/vnd.lifeos.sqlite-backup-v1" ||
    !isRecord(value.encryption) ||
    value.encryption.algorithm !== "aes-256-gcm" ||
    value.encryption.tagLength !== authenticationTagLength ||
    !isRecord(value.keyDerivation) ||
    value.keyDerivation.algorithm !== "scrypt" ||
    value.keyDerivation.N !== scryptParameters.N ||
    value.keyDerivation.r !== scryptParameters.r ||
    value.keyDerivation.p !== scryptParameters.p ||
    value.keyDerivation.keyLength !== scryptParameters.keyLength
  ) {
    throw new Error("Das verschlüsselte Backup-Format ist nicht kompatibel.");
  }
  return {
    header: value as unknown as EncryptedBackupHeader,
    iv: decodeBase64(value.encryption.iv, 12),
    salt: decodeBase64(value.keyDerivation.salt, 16),
  };
};

const ensureRegularSource = async (sourcePath: string) => {
  const info = await pathInfo(sourcePath);
  if (!info) throw new Error("Die verschlüsselte Backup-Datei fehlt.");
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(
      "Die verschlüsselte Backup-Quelle muss eine reguläre Datei sein.",
    );
  }
  return info;
};

const prepareNewDestination = async (destinationPath: string) => {
  if (!path.isAbsolute(destinationPath)) {
    throw new Error("Der verschlüsselte Backup-Zielpfad muss absolut sein.");
  }
  if (await pathInfo(destinationPath)) {
    throw new Error(
      "Das Backup-Ziel existiert bereits und wird nicht überschrieben.",
    );
  }
  const parent = path.dirname(destinationPath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error(
      "Das Backup-Zielverzeichnis muss ein reguläres Verzeichnis sein.",
    );
  }
  return parent;
};

export const createEncryptedSqliteBackup = async (options: {
  databaseUrl: string;
  documentsDirectory: string;
  destinationPath: string;
  passphrase: string;
}) => {
  requirePassphrase(options.passphrase);
  const destinationParent = await prepareNewDestination(
    options.destinationPath,
  );
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "lifeos-encrypted-backup-"),
  );
  await chmod(temporaryDirectory, 0o700);
  const backupDirectory = path.join(temporaryDirectory, "backup");
  const payloadPath = path.join(temporaryDirectory, "payload.bin");
  const stagingPath = path.join(
    destinationParent,
    `.${path.basename(options.destinationPath)}.creating-${randomUUID()}`,
  );
  try {
    await createSqliteBackup({
      databaseUrl: options.databaseUrl,
      documentsDirectory: options.documentsDirectory,
      destinationDirectory: backupDirectory,
    });
    await packDirectory(backupDirectory, payloadPath);
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const header: EncryptedBackupHeader = {
      formatVersion: 1,
      contentType: "application/vnd.lifeos.sqlite-backup-v1",
      encryption: {
        algorithm: "aes-256-gcm",
        iv: iv.toString("base64"),
        tagLength: authenticationTagLength,
      },
      keyDerivation: {
        algorithm: "scrypt",
        salt: salt.toString("base64"),
        N: scryptParameters.N,
        r: scryptParameters.r,
        p: scryptParameters.p,
        keyLength: scryptParameters.keyLength,
      },
    };
    const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
    const headerLength = Buffer.alloc(lengthBytes);
    headerLength.writeUInt32BE(headerBytes.length);
    const prefix = Buffer.concat([encryptedMagic, headerLength, headerBytes]);
    const key = await deriveEncryptionKey(options.passphrase, salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    key.fill(0);
    cipher.setAAD(prefix);
    const output = createWriteStream(stagingPath, { flags: "wx", mode: 0o600 });
    output.write(prefix);
    await pipeline(createReadStream(payloadPath), cipher, output, {
      end: false,
    });
    output.end(cipher.getAuthTag());
    await finished(output);
    await chmod(stagingPath, 0o600);
    await link(stagingPath, options.destinationPath);
    await unlink(stagingPath);
    return { destinationPath: options.destinationPath, header };
  } catch (error) {
    await rm(stagingPath, { force: true });
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

export const restoreEncryptedSqliteBackup = async (options: {
  sourcePath: string;
  targetDatabaseUrl: string;
  targetDocumentsDirectory: string;
  passphrase: string;
}) => {
  requirePassphrase(options.passphrase);
  if (!path.isAbsolute(options.sourcePath)) {
    throw new Error("Der verschlüsselte Backup-Quellpfad muss absolut sein.");
  }
  const sourceInfo = await ensureRegularSource(options.sourcePath);
  const fixedPrefixLength = encryptedMagic.length + lengthBytes;
  if (sourceInfo.size < fixedPrefixLength + authenticationTagLength) {
    throw new Error("Die verschlüsselte Backup-Datei ist unvollständig.");
  }
  const source = await open(options.sourcePath, "r");
  let headerBytes: Buffer;
  let headerLengthBytes: Buffer;
  let tag: Buffer;
  try {
    const magic = await readExact(source, encryptedMagic.length, 0);
    if (!magic.equals(encryptedMagic)) {
      throw new Error("Das verschlüsselte Backup-Format ist nicht kompatibel.");
    }
    headerLengthBytes = await readExact(
      source,
      lengthBytes,
      encryptedMagic.length,
    );
    const headerLength = headerLengthBytes.readUInt32BE();
    if (headerLength === 0 || headerLength > maximumHeaderLength) {
      throw new Error("Der Verschlüsselungsheader ist ungültig.");
    }
    if (
      sourceInfo.size <
      fixedPrefixLength + headerLength + authenticationTagLength
    ) {
      throw new Error("Die verschlüsselte Backup-Datei ist unvollständig.");
    }
    headerBytes = await readExact(source, headerLength, fixedPrefixLength);
    tag = await readExact(
      source,
      authenticationTagLength,
      sourceInfo.size - authenticationTagLength,
    );
  } finally {
    await source.close();
  }
  const { iv, salt } = parseHeader(headerBytes);
  const prefix = Buffer.concat([
    encryptedMagic,
    headerLengthBytes,
    headerBytes,
  ]);
  const ciphertextStart = prefix.length;
  const ciphertextEnd = sourceInfo.size - authenticationTagLength - 1;
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "lifeos-encrypted-restore-"),
  );
  await chmod(temporaryDirectory, 0o700);
  const payloadPath = path.join(temporaryDirectory, "payload.bin");
  const backupDirectory = path.join(temporaryDirectory, "backup");
  try {
    const key = await deriveEncryptionKey(options.passphrase, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    key.fill(0);
    decipher.setAAD(prefix);
    decipher.setAuthTag(tag);
    try {
      await pipeline(
        createReadStream(options.sourcePath, {
          start: ciphertextStart,
          end: ciphertextEnd,
        }),
        decipher,
        createWriteStream(payloadPath, { flags: "wx", mode: 0o600 }),
      );
    } catch {
      throw new Error(
        "Das verschlüsselte Backup konnte nicht authentifiziert werden.",
      );
    }
    await unpackPayload(payloadPath, backupDirectory);
    return await restoreSqliteBackup({
      backupDirectory,
      targetDatabaseUrl: options.targetDatabaseUrl,
      targetDocumentsDirectory: options.targetDocumentsDirectory,
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};
