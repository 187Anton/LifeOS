import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface ExternalCredentials {
  username: string;
  password: string;
}

export interface SealedCredentials {
  credentialsEncrypted: string;
  secretIv: string;
  secretTag: string;
}

export class IntegrationSecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32)
      throw new Error("Der Integrationsschlüssel muss 32 Byte lang sein.");
  }

  seal(credentials: ExternalCredentials, context: string): SealedCredentials {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), "utf8"),
      cipher.final(),
    ]);
    return {
      credentialsEncrypted: encrypted.toString("base64"),
      secretIv: iv.toString("base64"),
      secretTag: cipher.getAuthTag().toString("base64"),
    };
  }

  open(sealed: SealedCredentials, context: string): ExternalCredentials {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(sealed.secretIv, "base64"),
    );
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(sealed.secretTag, "base64"));
    const clear = Buffer.concat([
      decipher.update(Buffer.from(sealed.credentialsEncrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(clear) as Partial<ExternalCredentials>;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.password !== "string"
    )
      throw new Error("Der verschlüsselte Integrationszugang ist ungültig.");
    return { username: parsed.username, password: parsed.password };
  }
}
