// A request carried into Plans, from Sylvie. It is only words for the goal field: the student still reviews the details, and nothing is sent or planned
// until they save and then authorize on the next page. Read once. Plans stays mounted after its first visit, so it listens as well as looking on mount.
let pending: string | null = null;
const listeners = new Set<() => void>();
export const setPlanPrefill = (request: string) => { pending = request; listeners.forEach((listener) => listener()); };
export const takePlanPrefill = (): string | null => { const value = pending; pending = null; return value; };
export const onPlanPrefill = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
