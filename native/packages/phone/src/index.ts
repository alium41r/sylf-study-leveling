// The phone companion is a separate frontend module (master plan §4.5, ADR 0001). It is selected when the
// window is compact on a phone-class device and offers Home essentials only. Its UI is built in a later phase;
// this package exists so the boundary is fixed from the start and the large-screen app never imports it.
export const PHONE_FRONTEND_STATUS = "reserved" as const;
