import { intentFixture as frozenIntent } from "../contracts/fixtures";

/** Live PostgreSQL lifecycle tests schedule against the database's present day.
 * Keep the frozen pure-contract corpus unchanged and retain a real exam cutoff. */
export function intentFixture() {
  const intent = frozenIntent();
  intent.deadline = { kind: "FIXED", date: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10), examDayStudyAllowed: false };
  return intent;
}
