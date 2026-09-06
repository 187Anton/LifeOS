import { ApiError } from "../../errors.js";
import type {
  AuthenticationRepository,
  ProfileRepository,
} from "./repository.js";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from "./security.js";

const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export class AuthenticationService {
  constructor(
    private readonly repository: AuthenticationRepository,
    private readonly sessionTtlHours: number,
  ) {}

  async login(password: string): Promise<{ token: string; expiresAt: Date }> {
    const credential = await this.repository.findLocalCredential();
    if (
      !credential ||
      !(await verifyPassword(password, credential.passwordHash))
    ) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Das lokale Passwort ist nicht gültig.",
      );
    }

    if (
      passwordHashNeedsUpgrade(credential.passwordHash) &&
      this.repository.upgradePasswordHash
    ) {
      await this.repository.upgradePasswordHash(
        credential.userId,
        credential.passwordHash,
        await hashPassword(password),
      );
    }

    const token = createSessionToken();
    const expiresAt = new Date(
      Date.now() + this.sessionTtlHours * 60 * 60 * 1000,
    );
    await this.repository.createSession({
      userId: credential.userId,
      tokenHash: hashSessionToken(token),
      credentialRevision: credential.revision,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async authenticate(token: string | undefined): Promise<string> {
    if (!token || !sessionTokenPattern.test(token)) {
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Eine lokale Anmeldung ist erforderlich.",
      );
    }

    const userId = await this.repository.findAuthenticatedUser(
      hashSessionToken(token),
      new Date(),
    );
    if (!userId) {
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Die lokale Sitzung ist ungültig oder abgelaufen.",
      );
    }
    return userId;
  }

  async logout(token: string): Promise<void> {
    if (!sessionTokenPattern.test(token)) return;
    await this.repository.revokeSession(hashSessionToken(token), new Date());
  }
}

export class ProfileService {
  constructor(private readonly repository: ProfileRepository) {}

  async getProfile(userId: string) {
    const profile = await this.repository.getProfile(userId);
    if (!profile) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Das lokale Profil wurde nicht gefunden.",
      );
    }
    return profile;
  }

  updateSettings(
    userId: string,
    changes: Parameters<ProfileRepository["updateSettings"]>[1],
  ) {
    return this.repository.updateSettings(userId, changes);
  }
}
