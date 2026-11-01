import { describe, expect, it } from "vitest";
import {
  alternateNotesURL,
  freshDeploymentNotesURL,
} from "@/lib/notes/connection-location";

describe("Notes canonical address boundary", () => {
  it("targets the permanent site only for fresh web deployments, preserving stable references", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(
      freshDeploymentNotesURL(
        "https://sylf.test/notes",
        `https://sylf-new.vercel.app/notes?document=${id}&code=private`
      )
    ).toBe(`https://sylf.test/notes?document=${id}`);
    expect(
      freshDeploymentNotesURL(
        "https://sylf.test/notes",
        "http://localhost:3000/notes"
      )
    ).toBeUndefined();
    expect(
      freshDeploymentNotesURL(
        "https://sylf.test/notes",
        "capacitor://localhost/notes"
      )
    ).toBeUndefined();
    expect(
      freshDeploymentNotesURL(
        "https://sylf.test/notes",
        "https://sylf-new.vercel.app/#/notes"
      )
    ).toBeUndefined();
  });
  it("keeps the canonical origin in place and preserves older broker compatibility", () => {
    expect(
      alternateNotesURL("https://sylf.test/notes", "https://sylf.test/notes")
    ).toBeUndefined();
    expect(
      alternateNotesURL(undefined, "https://deployment.test/notes")
    ).toBeUndefined();
    expect(
      alternateNotesURL(null, "https://deployment.test/notes")
    ).toBeUndefined();
  });
  it("offers the fixed site with stable resource references, never OAuth state or arbitrary query content", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const result = alternateNotesURL(
      "https://sylf.test/notes",
      `https://deployment.test/notes?library=${id}&document=${id}&page=${id}&state=private&code=private&query=private`
    );
    const url = new URL(result!);
    expect(url.origin).toBe("https://sylf.test");
    expect([...url.searchParams.keys()]).toEqual([
      "library",
      "document",
      "page",
    ]);
    expect(url.searchParams.get("document")).toBe(id);
  });
  it.each([
    "javascript:alert(1)",
    "http://remote.test/notes",
    "https://user:secret@sylf.test/notes",
    "https://sylf.test/other",
    "https://sylf.test/notes?next=https://other.test",
    "https://sylf.test/notes#fragment",
    true,
    "not a URL",
  ])("rejects an unsafe or malformed advertised destination: %s", (value) => {
    expect(() =>
      alternateNotesURL(value, "https://deployment.test/notes")
    ).toThrow("verify its Sylf address");
  });
  it("allows local development loopback without allowing a remote page to redirect to HTTP loopback", () => {
    expect(
      alternateNotesURL(
        "http://localhost:3000/notes",
        "http://127.0.0.1:3000/notes"
      )
    ).toBe("http://localhost:3000/notes");
    expect(() =>
      alternateNotesURL(
        "http://localhost:3000/notes",
        "https://sylf.test/notes"
      )
    ).toThrow();
  });
});
