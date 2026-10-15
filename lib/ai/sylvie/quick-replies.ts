/** A narrowly scoped, model-free answer; extra language/style requests use the model. */
export function shortSylfIntroduction(message: string): string | null {
  const query = message.trim().replace(/\s+/g, " ");
  if (!/^(?:can you |could you )?(?:please )?(?:(?:(?:give|show|write)(?: me)? (?:a )?)?(?:(?:very |really )?short|brief|one[- ]sentence|single[- ]sentence) (?:intro(?:duction)?|overview) (?:to|of|about) sylf|(?:introduce|describe) sylf (?:very briefly|briefly|in (?:one|a single) sentence))(?: please)?[.!?]*$/i.test(query)) return null;
  return "Sylf helps you plan your studies, stay focused, and track your progress.";
}
