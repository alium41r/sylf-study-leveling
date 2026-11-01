// The sentence beside a session, kept apart so every case can be tested without a renderer. It says where the time is now and what happens next,
// and it never says "saved" about anything the server has not accepted. Only `settleAccepted` makes that true.

/** Time on this device is not a study record, and every surface says so in these words. */
export const LOCAL_SESSION_NOTE = "Tracked on this device. Not saved to your study record yet.";
export const PAST_CREDIT_NOTE = "Past 12 hours. One session counts for 12 hours at most, so this time will not be credited.";

export interface NoteFacts {
  active: boolean;
  /** Who the session in front of us belongs to, or who the next one will. */
  ownerId: number | null;
  /** Who is signed in. */
  me: number | null;
  offline: boolean;
  error: string | null;
  pastCredit: boolean;
}

export function sessionNote({ active, ownerId, me, offline, error, pastCredit }: NoteFacts) {
  if (ownerId === null) return LOCAL_SESSION_NOTE;
  if (ownerId !== me) return "Kept on this device. It is saved when you sign in again.";
  if (pastCredit) return PAST_CREDIT_NOTE;
  if (offline) return "Offline. Tracked on this device, and saved when Sylf is back.";
  if (error) return error;
  return active ? "Goes on your study record when you end it." : "Sessions go on your study record when you end them.";
}
