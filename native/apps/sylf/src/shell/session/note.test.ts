import { describe, expect, it } from "vitest";
import { LOCAL_SESSION_NOTE, PAST_CREDIT_NOTE, sessionNote } from "./note";

const facts = { active: true, ownerId: 7, me: 7, offline: false, error: null, pastCredit: false };

describe("the sentence beside a session", () => {
  it("keeps Phase 10's words for time that belongs to nobody", () => {
    expect(sessionNote({ ...facts, ownerId: null, me: null })).toBe(LOCAL_SESSION_NOTE);
    expect(sessionNote({ ...facts, ownerId: null, me: 7 })).toBe(LOCAL_SESSION_NOTE);
  });
  it("never says saved about something on its way", () => {
    expect(sessionNote(facts)).toBe("Goes on your study record when you end it.");
    expect(sessionNote({ ...facts, active: false })).toBe("Sessions go on your study record when you end them.");
    expect(sessionNote({ ...facts, offline: true })).toContain("saved when Sylf is back");
  });
  it("says whose it is when its owner is away", () => {
    expect(sessionNote({ ...facts, me: null })).toBe("Kept on this device. It is saved when you sign in again.");
  });
  it("gives the journal's reason when delivery is stuck", () => {
    expect(sessionNote({ ...facts, error: "Resume or end the existing timer before starting another subject." })).toContain("existing timer");
  });
  it("says so past the 12-hour cap, and that comes first", () => {
    expect(sessionNote({ ...facts, pastCredit: true, offline: true })).toBe(PAST_CREDIT_NOTE);
  });
});
