import type { Request } from "express";

import { verifyPassword } from "../profile/security.js";
import { CalDavError } from "./errors.js";
import type { CalDavRepository } from "./repository.js";

const parseBasicCredentials = (
  authorization: string | undefined,
): { username: string; password: string } | null => {
  if (!authorization?.startsWith("Basic ")) return null;
  const encoded = authorization.slice(6).trim();
  if (!encoded || encoded.length > 4096) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator <= 0) return null;
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
};

export class CalDavAuthenticationService {
  constructor(private readonly repository: CalDavRepository) {}

  async authenticate(request: Request): Promise<string> {
    const credentials = parseBasicCredentials(request.headers.authorization);
    if (!credentials) throw CalDavError.unauthorized();
    const stored = await this.repository.findCredential(credentials.username);
    if (
      !stored ||
      !(await verifyPassword(credentials.password, stored.passwordHash))
    ) {
      throw CalDavError.unauthorized(
        "Der CalDAV-Zugang ist ungültig oder widerrufen.",
      );
    }
    return stored.userId;
  }
}
