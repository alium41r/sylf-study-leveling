// Sample content for reviewing the tools. It is invented, every result is marked "sample", and a window says so. Without
// development tools the empty adapter is bound, so a store build cannot show any of this.
import type { ResourceEntry, ToolResult, WorkspaceDataAdapter } from "./contracts";

const sample = <T,>(data: T): Promise<ToolResult<T>> => Promise.resolve({ provenance: "sample", data });
const empty = <T,>(): Promise<ToolResult<T>> => Promise.resolve({ provenance: "live", data: null });

const NOTES = [
  { id: "complex", title: "Complex numbers", subject: "Further Mathematics", updated: "Edited today", body: [{ heading: "Polar form", text: "Any complex number z = a + bi can be written r(cos θ + i sin θ), where r is the modulus and θ the argument." }, { text: "Multiplying two numbers multiplies their moduli and adds their arguments, which is why rotations are so natural here." }, { heading: "De Moivre", text: "(cos θ + i sin θ)ⁿ = cos nθ + i sin nθ for every integer n. Use it to find roots of unity, spaced evenly around the unit circle." }, { heading: "To revisit", text: "Why the principal argument is taken in (−π, π], and what breaks at the boundary." }] },
  { id: "orbitals", title: "Orbital hybridisation", subject: "Chemistry", updated: "Edited yesterday", body: [{ heading: "sp³", text: "Four equivalent orbitals point to the corners of a tetrahedron, 109.5° apart. Methane is the standard example." }, { heading: "sp²", text: "Three orbitals in a plane, 120° apart, with one p orbital left over to form the π bond in ethene." }, { text: "A double bond is one σ bond and one π bond, which is why rotation around it is restricted." }] },
  { id: "essay", title: "Essay outline", subject: "Literature", updated: "Edited Monday", body: [{ heading: "Thesis", text: "The narrator's unreliability is the novel's real subject, not a device in service of its plot." }, { heading: "Evidence", text: "The three accounts of the same evening in chapters two, seven and nineteen." }] },
];

const PDFS = [
  { id: "paper-2023", title: "Past paper, June 2023", detail: "Further Mathematics, Paper 1", pages: [{ heading: "Question 1", lines: ["The complex number z satisfies |z − 2i| = |z + 4|.", "(a) Sketch the locus of z on an Argand diagram.", "(b) Find the least value of |z|."] }, { heading: "Question 2", lines: ["Express −8 in the form r(cos θ + i sin θ).", "Hence find the three cube roots of −8.", "Show these roots on an Argand diagram."] }, { heading: "Question 3", lines: ["Prove by induction that, for all positive integers n,", "(cos θ + i sin θ)ⁿ = cos nθ + i sin nθ."] }] },
  { id: "waves", title: "Waves and optics", detail: "Physics, chapter 9", pages: [{ heading: "Interference", lines: ["Two coherent sources produce a stable pattern of fringes.", "The path difference decides whether waves reinforce or cancel."] }, { heading: "Diffraction", lines: ["A wave spreads as it passes through a narrow gap.", "The effect is greatest when the gap is close to the wavelength."] }] },
];

const BOARDS = [{ id: "unit-circle", title: "Unit circle sketch", detail: "Further Mathematics" }, { id: "mechanism", title: "Reaction mechanism", detail: "Chemistry" }];


const SHELF: ResourceEntry[] = [
  { id: "r-complex", kind: "note", documentId: "complex", title: "Complex numbers", detail: "Note, Further Mathematics" },
  { id: "r-paper", kind: "pdf", documentId: "paper-2023", title: "Past paper, June 2023", detail: "PDF, Further Mathematics" },
  { id: "r-circle", kind: "board", documentId: "unit-circle", title: "Unit circle sketch", detail: "Whiteboard, Further Mathematics" },
  { id: "r-orbitals", kind: "note", documentId: "orbitals", title: "Orbital hybridisation", detail: "Note, Chemistry" },
  { id: "r-waves", kind: "pdf", documentId: "waves", title: "Waves and optics", detail: "PDF, Physics" },
];

export const SAMPLE_WORKSPACE_DATA: WorkspaceDataAdapter = {
  notes: () => sample(NOTES),
  pdfs: () => sample(PDFS),
  boards: () => sample(BOARDS),
  sylvie: () => sample([{ id: "thread", title: "Roots of unity", messages: [{ id: "1", from: "person", text: "Why are the cube roots of −8 evenly spaced?" }, { id: "2", from: "sylvie", text: "Each root has the same modulus, 2, so they all sit on one circle. De Moivre's theorem says their arguments differ by 2π/3, a third of a full turn. Three equal turns bring you back to where you began." }, { id: "3", from: "person", text: "So for fourth roots it would be a quarter turn?" }, { id: "4", from: "sylvie", text: "Exactly. n roots, spaced 2π/n apart. Try sketching the fourth roots of 16 and see whether the picture agrees." }] }]),
  sounds: () => sample([{ id: "rain", name: "Rain on a window", detail: "Ambient" }, { id: "library", name: "Quiet library", detail: "Ambient" }, { id: "brown", name: "Brown noise", detail: "Noise" }, { id: "piano", name: "Slow piano", detail: "Music" }]),
  resources: () => sample(SHELF),
};

export const EMPTY_WORKSPACE_DATA: WorkspaceDataAdapter = { notes: empty, pdfs: empty, boards: empty, sylvie: empty, sounds: empty, resources: empty };

export const workspaceDataFor = (devTools: boolean, scenario: "sample" | "empty" | "slow" | null) => (devTools && scenario !== "empty" ? SAMPLE_WORKSPACE_DATA : EMPTY_WORKSPACE_DATA);
