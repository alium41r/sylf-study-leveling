import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MarkdownRenderer from "@/app/components/MarkdownRenderer";
import ChatText from "@/app/components/system/chat/ChatText";
import { normalizeMathMarkdown } from "@/lib/markdown-math";

afterEach(cleanup);
const formulas = (container: HTMLElement) => [...container.querySelectorAll('annotation[encoding="application/x-tex"]')].map(node => node.textContent?.trim());

describe("shared maths rendering", () => {
  it.each([false, true])("renders the screenshot's orphan vector without swallowing prose (compact=%s)", compact => {
    const text = String.raw`Take unit vectors $\mathbf{i}$ along the barrier (tangential) and $\mathbf j along the normal, pointing away from the barrier.

**Before impact**, resolving the velocity:`;
    const { container } = render(<MarkdownRenderer content={text} compact={compact} />);
    expect(formulas(container)).toEqual([String.raw`\mathbf{i}`, String.raw`\mathbf j`]);
    expect(container.textContent).toContain("along the normal, pointing away from the barrier.");
    expect(container.querySelector("strong")).toHaveTextContent("Before impact");
    expect(container.querySelector(".katex-error")).toBeNull();
    expect(container.querySelector("p")?.textContent).not.toContain("$\\mathbf");
  });

  it.each([
    String.raw`Use $\mathbf{j}$ and $\alpha + \beta = \gamma$.`,
    String.raw`Use \(\mathbf{j}\) and \(\alpha + \beta = \gamma\).`,
  ])("accepts inline delimiter variants and preserves surrounding spaces", content => {
    const { container } = render(<ChatText content={content} />);
    expect(formulas(container)).toEqual([String.raw`\mathbf{j}`, String.raw`\alpha + \beta = \gamma`]);
    const paragraph = container.querySelector("p")!;
    expect(paragraph.firstChild?.textContent).toBe("Use ");
    expect(paragraph.childNodes[2]?.textContent).toBe(" and ");
    expect(paragraph.lastChild?.textContent).toBe(".");
  });

  it.each([
    String.raw`$$\frac{u^2\cos^2\alpha}{e u^2\sin^2\alpha}=1$$`,
    String.raw`\[\frac{u^2\cos^2\alpha}{e u^2\sin^2\alpha}=1\]`,
    "$$\n\\frac{u^2\\cos^2\\alpha}{e u^2\\sin^2\\alpha}=1\n$$",
    "```math\n\\frac{u^2\\cos^2\\alpha}{e u^2\\sin^2\\alpha}=1\n```",
  ])("uses display layout for each block notation", content => {
    const { container } = render(<MarkdownRenderer content={content} />);
    expect(container.querySelectorAll(".katex-display")).toHaveLength(1);
    expect(container.querySelector(".katex-error")).toBeNull();
    expect(formulas(container)).toEqual([String.raw`\frac{u^2\cos^2\alpha}{e u^2\sin^2\alpha}=1`]);
  });

  it("keeps display maths within lists, including multiline aligned derivations", () => {
    const content = String.raw`1. Resolve the velocity: \[\mathbf{v} = (u\cos\alpha, -eu\sin\alpha)\]
2. Use perpendicularity:
   \[\begin{aligned}
   \mathbf{u}\cdot\mathbf{v} &= 0 \\
   u^2\cos^2\alpha - eu^2\sin^2\alpha &= 0
   \end{aligned}\]
3. Therefore $e=\cot^2\alpha$.`;
    const { container } = render(<MarkdownRenderer content={content} />);
    expect(container.querySelectorAll("ol > li")).toHaveLength(3);
    expect(container.querySelectorAll("li .katex-display")).toHaveLength(2);
    expect(container.querySelector(".katex-error")).toBeNull();
    expect(formulas(container)).toHaveLength(3);
  });

  it("preserves literal code, fences, indentation and metadata examples", () => {
    const content = [
      String.raw`Write \(x\) here, but keep ` + "`" + String.raw`\(x\) $\mathbf j <!-- model: example -->` + "`",
      "````javascript", String.raw`const value = "\[x\]";`, "```", "````",
      "~~~text", String.raw`\(x\)`, "~~~",
      String.raw`    \[x\]`,
    ].join("\n\n");
    const normalized = normalizeMathMarkdown(content);
    expect(normalized).toContain(String.raw`const value = "\[x\]";`);
    expect(normalized).toContain(String.raw`    \[x\]`);
    const { container } = render(<MarkdownRenderer content={content} />);
    expect(container.querySelectorAll("pre")).toHaveLength(3);
    expect(container.textContent).toContain("<!-- model: example -->");
    expect(formulas(container)).toEqual(["x"]);
  });

  it("leaves escaped currency dollars and link destinations alone", () => {
    const content = String.raw`Pay \$5 or \$10. Literal: \$\mathbf j. [Reference](https://example.com/\mathbf?q=$j).

<!-- model: old -->Keep this text.`;
    const { container } = render(<MarkdownRenderer content={content} />);
    expect(formulas(container)).toHaveLength(0);
    expect(container.textContent).toContain("Pay $5 or $10.");
    expect(container.textContent).toContain(String.raw`Literal: $\mathbf j`);
    expect(container.textContent).not.toContain("model: old");
    expect(container.querySelector("a")?.getAttribute("href")).toContain("q=$j");
  });

  it.each(["An unmatched ` then \\(x\\).", "An escaped \\` then \\(x\\)."])("does not mistake escaped or unmatched backticks for a code span", content => {
    const { container } = render(<MarkdownRenderer content={content} />);
    expect(formulas(container)).toEqual(["x"]);
  });

  it("renders roots, matrices, cases, integrals, units and Unicode without errors", () => {
    const { container } = render(<MarkdownRenderer content={String.raw`$\sqrt{a^2+b^2}$, $\vec{F}=m\mathbf{a}$, $90^\circ$, $5\,\mathrm{m\,s^{-1}}$, $α+β=γ$.

$$\begin{bmatrix}1&2\\3&4\end{bmatrix}\quad f(x)=\begin{cases}x^2&x\ge0\\-x&x<0\end{cases}\quad \int_0^1 x^2\,dx=\frac13$$`} />);
    expect(formulas(container)).toHaveLength(6);
    expect(container.querySelector(".katex-error")).toBeNull();
    expect(container.querySelectorAll("math")).toHaveLength(6);
  });

  it("does not throw or lose following prose for unsupported or incomplete TeX", () => {
    const { container, rerender } = render(<MarkdownRenderer content={String.raw`$\frac{1}$

Still readable.`} />);
    expect(container.textContent).toContain("Still readable.");
    expect(container.querySelector(".katex-error")).not.toBeNull();
    for (const content of ["$", String.raw`$\mathbf{`, String.raw`$\mathbf{j}`, String.raw`$\mathbf{j}$ along the normal.`, "$$\n\\frac{u", "$$\n\\frac{u}{v}\n$$"]) {
      expect(() => rerender(<MarkdownRenderer content={content} />)).not.toThrow();
    }
    expect(container.querySelector(".katex-error")).toBeNull();
    expect(formulas(container)).toEqual([String.raw`\frac{u}{v}`]);
  });

  it("disables trusted HTML/URL commands and bounds macro expansion", () => {
    const { container } = render(<MarkdownRenderer content={String.raw`$\href{javascript:alert(1)}{bad}$ $\htmlClass{evil}{x}$ $\def\a{\a}\a$ <script>alert(1)</script>`} />);
    expect(container.querySelector("script, .evil, a[href^='javascript:']")).toBeNull();
  });
});
