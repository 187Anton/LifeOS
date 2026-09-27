import { crc32, inflateRawSync } from "node:zlib";

/**
 * Strenger, rein lokaler ZIP-Leser für OOXML-Dateien.
 *
 * Bewusste Entscheidung ohne zusätzliche Laufzeitabhängigkeit: Die für Paket 8
 * geforderten Grenzwerte müssen **vor** dem Entpacken greifen – Eintragsanzahl,
 * komprimierte und entpackte Gesamtgröße, Einzelgröße und Kompressions
 * verhältnis. Genau dafür muss das zentrale Verzeichnis (Central Directory)
 * direkt gelesen werden; die öffentlichen Schnittstellen üblicher ZIP-Bibliotheken
 * entpacken beim Aufzählen bereits oder legen die externen Dateiattribute
 * (Symlinkerkennung) nicht offen. Deshalb wird das zentrale Verzeichnis hier
 * selbst ausgewertet und zum Entpacken ausschließlich der eingebaute,
 * begrenzbare Inflate aus `node:zlib` genutzt. Das Ergebnis: keine neue
 * Abhängigkeit, kein nativer Zusatz, keine Änderung am Sidecar-Bündel – und die
 * Prüfungen liegen nachweisbar vor dem ersten entpackten Byte.
 *
 * Abgelehnt werden: mehrdatenträgerige Archive, ZIP64, verschlüsselte Einträge,
 * andere Kompressionsverfahren als `stored` und `deflate`, absolute Pfade,
 * Pfadtraversal, Symlinks, doppelte Einträge, unzulässige Namen und beschädigte
 * Strukturen. Ein externer Zugriff findet nie statt: es gibt in dieser Datei
 * keinen Netzwerk-, Kindprozess- oder Dateisystempfad.
 */

/** Fehlercodes des ZIP-Lesers. */
export type OoxmlZipErrorCode =
  | "invalid_zip"
  | "unsupported_zip"
  | "encrypted_zip"
  | "zip_entry_limit"
  | "zip_size_limit"
  | "unsafe_zip_path"
  | "duplicate_zip_entry"
  | "damaged_zip"
  | "timeout";

export class OoxmlZipError extends Error {
  constructor(readonly code: OoxmlZipErrorCode) {
    super(`OOXML-ZIP abgelehnt: ${code}`);
    this.name = "OoxmlZipError";
  }
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MAX_COMMENT_BYTES = 0xffff;
const END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const CENTRAL_DIRECTORY_ENTRY_BYTES = 46;
const LOCAL_FILE_HEADER_BYTES = 30;
const ZIP64_MARKER = 0xffffffff;
const ZIP16_ENTRY_MARKER = 0xffff;

/** Flagbits, die eine Verschlüsselung bezeichnen. */
const ENCRYPTED_FLAGS = 0x0001 | 0x0040 | 0x2000;

/** Zulässige Kompressionsverfahren: `stored` und `deflate`. */
const STORED = 0;
const DEFLATE = 8;

/** Zustand, der für die Prüfung eines Eintrags nötig ist. */
export interface ZipLimits {
  readonly maxEntries: number;
  readonly maxCompressedBytes: number;
  readonly maxEntryBytes: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxCompressionRatio: number;
  /** Zeitpunkt (ms seit Epoche), ab dem der Lauf abgebrochen wird. */
  readonly deadline: number;
}

/** Beschreibung eines gültigen Eintrags aus dem zentralen Verzeichnis. */
export interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly crc: number;
  readonly localHeaderOffset: number;
}

const now = () => Date.now();

/**
 * Ein Eintragsname muss ein reiner, relativer ASCII-Pfad in Schrägstrich
 * notation sein. Alles andere wird abgelehnt, statt es umzuschreiben.
 */
const isSafeEntryName = (name: string): boolean => {
  if (name.length === 0 || name.length > 512) return false;
  // Nur druckbare ASCII-Zeichen: OOXML-Teilenamen sind ASCII. Das verhindert
  // zugleich Ersatzzeichen aus einer falschen Zeichensatzdeutung.
  if (!/^[\x20-\x7e]+$/.test(name)) return false;
  if (name.startsWith("/") || name.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(name)) return false;
  if (name.includes("\\")) return false;
  const segments = name.split("/");
  // Verzeichniseinträge enden auf "/"; nur das letzte Segment darf leer sein.
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.length === 0) {
      if (index === segments.length - 1) continue;
      return false;
    }
    if (segment === "." || segment === "..") return false;
  }
  return true;
};

const requireWithin = (
  offset: number,
  length: number,
  limit: number,
  code: OoxmlZipErrorCode,
) => {
  if (offset < 0 || length < 0 || offset + length > limit)
    throw new OoxmlZipError(code);
};

/** Sucht das End-of-Central-Directory-Verzeichnis am Dateiende. */
const findEndOfCentralDirectory = (bytes: Buffer): number => {
  const minimum = Math.max(
    0,
    bytes.byteLength - (MAX_COMMENT_BYTES + END_OF_CENTRAL_DIRECTORY_BYTES),
  );
  for (
    let offset = bytes.byteLength - END_OF_CENTRAL_DIRECTORY_BYTES;
    offset >= minimum;
    offset -= 1
  ) {
    if (bytes.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = bytes.readUInt16LE(offset + 20);
    // Der Kommentar muss exakt am Dateiende enden; damit ist die Fundstelle
    // eindeutig und angehängter Müll wird nicht stillschweigend akzeptiert.
    if (
      offset + END_OF_CENTRAL_DIRECTORY_BYTES + commentLength !==
      bytes.byteLength
    )
      continue;
    return offset;
  }
  throw new OoxmlZipError("invalid_zip");
};

/**
 * Liest und prüft ein OOXML-ZIP. Es wird hier kein Eintrag entpackt; geprüft
 * werden ausschließlich die Angaben des zentralen Verzeichnisses.
 */
export class OoxmlZipArchive {
  private constructor(
    private readonly bytes: Buffer,
    private readonly entries: ReadonlyMap<string, ZipEntry>,
    private readonly centralDirectoryOffset: number,
    private readonly limits: ZipLimits,
  ) {}

  static open(bytes: Buffer, limits: ZipLimits): OoxmlZipArchive {
    if (now() > limits.deadline) throw new OoxmlZipError("timeout");
    if (bytes.byteLength < END_OF_CENTRAL_DIRECTORY_BYTES)
      throw new OoxmlZipError("invalid_zip");
    if (bytes.byteLength > limits.maxCompressedBytes)
      throw new OoxmlZipError("zip_size_limit");

    const end = findEndOfCentralDirectory(bytes);
    const diskNumber = bytes.readUInt16LE(end + 4);
    const centralDirectoryDisk = bytes.readUInt16LE(end + 6);
    const entriesThisDisk = bytes.readUInt16LE(end + 8);
    const declaredEntries = bytes.readUInt16LE(end + 10);
    const centralDirectorySize = bytes.readUInt32LE(end + 12);
    const centralDirectoryOffset = bytes.readUInt32LE(end + 16);

    // Mehrdatenträgerige Archive und ZIP64 werden nicht unterstützt.
    if (diskNumber !== 0 || centralDirectoryDisk !== 0)
      throw new OoxmlZipError("unsupported_zip");
    if (
      declaredEntries === ZIP16_ENTRY_MARKER ||
      entriesThisDisk === ZIP16_ENTRY_MARKER ||
      centralDirectoryOffset === ZIP64_MARKER ||
      centralDirectorySize === ZIP64_MARKER
    )
      throw new OoxmlZipError("unsupported_zip");
    if (declaredEntries !== entriesThisDisk)
      throw new OoxmlZipError("unsupported_zip");
    if (declaredEntries > limits.maxEntries)
      throw new OoxmlZipError("zip_entry_limit");

    requireWithin(
      centralDirectoryOffset,
      centralDirectorySize,
      end,
      "invalid_zip",
    );
    if (centralDirectorySize > limits.maxCompressedBytes)
      throw new OoxmlZipError("zip_size_limit");

    const entries = new Map<string, ZipEntry>();
    const seenLowercase = new Set<string>();
    let cursor = centralDirectoryOffset;
    let totalUncompressed = 0;

    for (let index = 0; index < declaredEntries; index += 1) {
      if (now() > limits.deadline) throw new OoxmlZipError("timeout");
      requireWithin(
        cursor,
        CENTRAL_DIRECTORY_ENTRY_BYTES,
        centralDirectoryOffset + centralDirectorySize,
        "invalid_zip",
      );
      if (bytes.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_ENTRY)
        throw new OoxmlZipError("invalid_zip");

      const flags = bytes.readUInt16LE(cursor + 8);
      const method = bytes.readUInt16LE(cursor + 10);
      const crc = bytes.readUInt32LE(cursor + 16);
      const compressedSize = bytes.readUInt32LE(cursor + 20);
      const uncompressedSize = bytes.readUInt32LE(cursor + 24);
      const nameLength = bytes.readUInt16LE(cursor + 28);
      const extraLength = bytes.readUInt16LE(cursor + 30);
      const commentLength = bytes.readUInt16LE(cursor + 32);
      const diskStart = bytes.readUInt16LE(cursor + 34);
      const externalAttributes = bytes.readUInt32LE(cursor + 38);
      const localHeaderOffset = bytes.readUInt32LE(cursor + 42);

      requireWithin(
        cursor + CENTRAL_DIRECTORY_ENTRY_BYTES,
        nameLength + extraLength + commentLength,
        centralDirectoryOffset + centralDirectorySize,
        "invalid_zip",
      );

      if (
        compressedSize === ZIP64_MARKER ||
        uncompressedSize === ZIP64_MARKER ||
        localHeaderOffset === ZIP64_MARKER
      )
        throw new OoxmlZipError("unsupported_zip");
      if (diskStart !== 0) throw new OoxmlZipError("unsupported_zip");
      if ((flags & ENCRYPTED_FLAGS) !== 0)
        throw new OoxmlZipError("encrypted_zip");
      if (method !== STORED && method !== DEFLATE)
        throw new OoxmlZipError("unsupported_zip");

      // Unix-Dateimodus liegt in den oberen 16 Bit der externen Attribute.
      if (((externalAttributes >>> 16) & 0xf000) === 0xa000)
        throw new OoxmlZipError("unsafe_zip_path");

      const name = bytes.toString(
        "utf8",
        cursor + CENTRAL_DIRECTORY_ENTRY_BYTES,
        cursor + CENTRAL_DIRECTORY_ENTRY_BYTES + nameLength,
      );
      if (!isSafeEntryName(name)) throw new OoxmlZipError("unsafe_zip_path");

      requireWithin(
        localHeaderOffset,
        LOCAL_FILE_HEADER_BYTES,
        end,
        "invalid_zip",
      );

      cursor +=
        CENTRAL_DIRECTORY_ENTRY_BYTES +
        nameLength +
        extraLength +
        commentLength;

      // Verzeichniseinträge tragen keinen Inhalt und werden nicht geführt.
      if (name.endsWith("/")) continue;

      if (compressedSize > limits.maxCompressedBytes)
        throw new OoxmlZipError("zip_size_limit");
      if (uncompressedSize > limits.maxEntryBytes)
        throw new OoxmlZipError("zip_size_limit");
      if (
        uncompressedSize > 0 &&
        compressedSize > 0 &&
        uncompressedSize / compressedSize > limits.maxCompressionRatio
      )
        throw new OoxmlZipError("zip_size_limit");
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > limits.maxTotalUncompressedBytes)
        throw new OoxmlZipError("zip_size_limit");

      const lowercase = name.toLowerCase();
      if (entries.has(name) || seenLowercase.has(lowercase))
        throw new OoxmlZipError("duplicate_zip_entry");
      seenLowercase.add(lowercase);
      entries.set(name, {
        name,
        method,
        compressedSize,
        uncompressedSize,
        crc,
        localHeaderOffset,
      });
    }

    return new OoxmlZipArchive(bytes, entries, centralDirectoryOffset, limits);
  }

  /** Anzahl der inhaltstragenden Einträge. */
  get entryCount(): number {
    return this.entries.size;
  }

  /** `true`, wenn ein inhaltstragender Eintrag mit genau diesem Namen existiert. */
  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Namen aller inhaltstragenden Einträge, aufsteigend sortiert. */
  names(): string[] {
    return [...this.entries.keys()].sort();
  }

  /**
   * Entpackt genau einen Eintrag. Die Ausgabegröße ist hart auf die im
   * zentralen Verzeichnis angegebene Größe begrenzt; weicht das Ergebnis ab
   * oder stimmt die Prüfsumme nicht, gilt das Archiv als beschädigt.
   */
  read(name: string): Buffer {
    if (now() > this.limits.deadline) throw new OoxmlZipError("timeout");
    const entry = this.entries.get(name);
    if (!entry) throw new OoxmlZipError("invalid_zip");
    const offset = entry.localHeaderOffset;
    requireWithin(
      offset,
      LOCAL_FILE_HEADER_BYTES,
      this.centralDirectoryOffset,
      "damaged_zip",
    );
    if (this.bytes.readUInt32LE(offset) !== LOCAL_FILE_HEADER)
      throw new OoxmlZipError("damaged_zip");

    const localFlags = this.bytes.readUInt16LE(offset + 6);
    const localMethod = this.bytes.readUInt16LE(offset + 8);
    const localNameLength = this.bytes.readUInt16LE(offset + 26);
    const localExtraLength = this.bytes.readUInt16LE(offset + 28);
    if (localMethod !== entry.method) throw new OoxmlZipError("damaged_zip");
    if ((localFlags & ENCRYPTED_FLAGS) !== 0)
      throw new OoxmlZipError("encrypted_zip");

    const dataStart =
      offset + LOCAL_FILE_HEADER_BYTES + localNameLength + localExtraLength;
    requireWithin(
      dataStart,
      entry.compressedSize,
      this.centralDirectoryOffset,
      "damaged_zip",
    );
    const compressed = this.bytes.subarray(
      dataStart,
      dataStart + entry.compressedSize,
    );

    let output: Buffer;
    if (entry.method === STORED) {
      if (entry.compressedSize !== entry.uncompressedSize)
        throw new OoxmlZipError("damaged_zip");
      output = Buffer.from(compressed);
    } else {
      try {
        output = inflateRawSync(compressed, {
          // Harte Obergrenze: mehr als die angegebene entpackte Größe wird nie
          // erzeugt. Eine Bombe, die eine kleine Größe angibt und größer
          // entpackt, scheitert damit an der Zuweisung.
          maxOutputLength: Math.max(entry.uncompressedSize, 1),
        });
      } catch {
        throw new OoxmlZipError("damaged_zip");
      }
    }
    if (output.byteLength !== entry.uncompressedSize)
      throw new OoxmlZipError("damaged_zip");
    if (crc32(output) !== entry.crc) throw new OoxmlZipError("damaged_zip");
    return output;
  }
}

/** `true`, wenn der Inhalt mit der ZIP-Kennung `PK\x03\x04` beginnt. */
export const hasZipSignature = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= 4 &&
  bytes[0] === 0x50 &&
  bytes[1] === 0x4b &&
  (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
  (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
