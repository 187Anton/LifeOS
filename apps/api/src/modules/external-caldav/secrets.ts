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
export interface SealedToken {
  tokenEncrypted: string;
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
    const sealed = this.sealValue(credentials, context);
    return { credentialsEncrypted: sealed.encrypted, ...sealed.metadata };
  }

  sealToken(token: string, context: string): SealedToken {
    const sealed = this.sealValue({ token }, context);
    return { tokenEncrypted: sealed.encrypted, ...sealed.metadata };
  }

  openToken(sealed: SealedToken, context: string): string {
    const parsed = this.openValue(sealed.tokenEncrypted, sealed, context) as {
      token?: unknown;
    };
    if (typeof parsed.token !== "string")
      throw new Error("Der verschlüsselte Integrationszugang ist ungültig.");
    return parsed.token;
  }

  private sealValue(value: unknown, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return {
      encrypted: encrypted.toString("base64"),
      metadata: {
        secretIv: iv.toString("base64"),
        secretTag: cipher.getAuthTag().toString("base64"),
      },
    };
  }

  open(sealed: SealedCredentials, context: string): ExternalCredentials {
    const parsed = this.openValue(
      sealed.credentialsEncrypted,
      sealed,
      context,
    ) as Partial<ExternalCredentials>;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.password !== "string"
    )
      throw new Error("Der verschlüsselte Integrationszugang ist ungültig.");
    return { username: parsed.username, password: parsed.password };
  }

  private openValue(
    encrypted: string,
    sealed: { secretIv: string; secretTag: string },
    context: string,
  ): unknown {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(sealed.secretIv, "base64"),
    );
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(sealed.secretTag, "base64"));
    const clear = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(clear) as unknown;
  }
}
