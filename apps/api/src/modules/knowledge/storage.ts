import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export class UnsafeStoragePathError extends Error {}
export class StoredDocumentNotFoundError extends Error {}

const extensionFor = (fileName: string) => {
  const extension = path.extname(fileName).toLowerCase().slice(1);
  return /^[a-z0-9]{1,16}$/.test(extension) ? `.${extension}` : ".bin";
};

const validateStorageKey = (storageKey: string) => {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,16}$/.test(storageKey)) {
    throw new UnsafeStoragePathError("Ungültiger interner Dokumentpfad.");
  }
};

export class LocalDocumentStorage {
  constructor(private readonly root: string) {
    if (!path.isAbsolute(root)) {
      throw new UnsafeStoragePathError(
        "Das Dokumentenverzeichnis muss absolut sein.",
      );
    }
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new UnsafeStoragePathError(
        "Das Dokumentenziel muss ein reguläres Verzeichnis sein.",
      );
    }
    await chmod(this.root, 0o700);
  }

  async store(userId: string, fileName: string, bytes: Buffer) {
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
      throw new RangeError("Das Dokument überschreitet 25 MiB.");
    }
    await this.initialize();
    const userDirectory = await this.userDirectory(userId, true);
    const storageKey = `${randomUUID()}${extensionFor(fileName)}`;
    const target = path.join(userDirectory, storageKey);
    const handle = await open(
      target,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(target, 0o600);
    return {
      storageKey,
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      modifiedAt: (await stat(target)).mtime,
    };
  }

  async read(userId: string, storageKey: string): Promise<Buffer> {
    const target = await this.safeFile(userId, storageKey);
    return readFile(target);
  }

  async delete(userId: string, storageKey: string): Promise<void> {
    const target = await this.safeFile(userId, storageKey);
    await rm(target);
  }

  private async userDirectory(userId: string, create: boolean) {
    if (!/^[0-9a-f-]{36}$/.test(userId)) {
      throw new UnsafeStoragePathError("Ungültiger Besitzerpfad.");
    }
    const target = path.join(this.root, userId);
    if (create) await mkdir(target, { recursive: true, mode: 0o700 });
    const info = await lstat(target).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new StoredDocumentNotFoundError();
      }
      throw error;
    });
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new UnsafeStoragePathError("Unsicheres Besitzerverzeichnis.");
    }
    await chmod(target, 0o700);
    const rootReal = await realpath(this.root);
    const targetReal = await realpath(target);
    if (path.dirname(targetReal) !== rootReal) {
      throw new UnsafeStoragePathError(
        "Dokumentenpfad verlässt das Speicherziel.",
      );
    }
    return targetReal;
  }

  private async safeFile(userId: string, storageKey: string) {
    validateStorageKey(storageKey);
    const userDirectory = await this.userDirectory(userId, false);
    const target = path.join(userDirectory, storageKey);
    const info = await lstat(target).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new StoredDocumentNotFoundError();
      }
      throw error;
    });
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new UnsafeStoragePathError(
        "Nur reguläre Dokumentdateien sind erlaubt.",
      );
    }
    const resolved = await realpath(target);
    if (path.dirname(resolved) !== userDirectory) {
      throw new UnsafeStoragePathError(
        "Dokumentenpfad verlässt das Speicherziel.",
      );
    }
    return resolved;
  }
}
