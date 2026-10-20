export type NotesErrorCode =
  | "SESSION_ENDED"
  | "OWNERSHIP"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CORRUPT"
  | "UNSUPPORTED"
  | "LIMIT"
  | "QUOTA"
  | "STORAGE"
  | "ACK_UNCERTAIN";

/** Errors contain identifiers/status only. Never log document bytes or credentials. */
export class NotesError extends Error {
  constructor(
    public readonly code: NotesErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "NotesError";
  }
}

export function storageError(error: unknown): NotesError {
  if (error instanceof NotesError) return error;
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  return new NotesError(
    name === "QuotaExceededError" ? "QUOTA" : "STORAGE",
    name === "QuotaExceededError"
      ? "Device storage is full; this change was not acknowledged."
      : "Device persistence failed; retry with the same operation ID.",
    { cause: error }
  );
}
