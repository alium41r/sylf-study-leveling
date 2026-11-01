import { describe,expect,it } from "vitest";
import { studentVisibleText } from "@/lib/planner/v2/server/activity";
describe("student-visible Planner activity",()=>{
  it("preserves educational text while hiding credentials, URL secrets and internal references",()=>{
    const text="Integrate x² 🧠. sk-secret Bearer private api_key=hidden https://user:pass@example.edu/paper?token=secret#key candidate_12 12345678-1234-1234-1234-123456789abc";
    const shown=studentVisibleText(text);expect(shown).toContain("Integrate x² 🧠.");expect(shown).toContain("https://example.edu/paper");
    for(const hidden of ["sk-secret","private","api_key=hidden","user:pass","token=secret","candidate_12","12345678-"])expect(shown).not.toContain(hidden);
  });
  it("redacts incomplete credential prefixes across successively received snapshots",()=>{
    for(const text of ["sk-","sk-a","Bearer ","api_key=s","https://x.test/p?token=s"]){const shown=studentVisibleText(text);expect(shown).not.toContain("sk-");expect(shown).not.toContain("api_key=");expect(shown).not.toContain("?token=");}
  });
});
