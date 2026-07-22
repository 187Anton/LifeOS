export class CalDavError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly condition?: string,
  ) {
    super(message);
    this.name = "CalDavError";
  }

  static unauthorized(message = "CalDAV-Anmeldung erforderlich.") {
    return new CalDavError(401, message);
  }
}
