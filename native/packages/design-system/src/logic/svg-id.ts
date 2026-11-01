/** SVG references break on spaces, and a broken gradient paints solid black. Anything built from a label goes through here. */
export const svgId = (text: string) => text.replace(/[^a-zA-Z0-9_-]/g, "-");
