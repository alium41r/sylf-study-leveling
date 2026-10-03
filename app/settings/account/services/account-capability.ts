/**
 * ============================================================================
 * Account Actions Capability Boundary (Phase 1D-G)
 * ============================================================================
 * Mediates security-sensitive and destructive account operations.
 * - Web: executes standard fetch against Next.js route handlers.
 * - Mobile Mock: executes deterministic, safe local mock actions.
 * - Mobile Normal (Pre-Auth): fails closed with an explicit descriptive error.
 * ============================================================================
 */

import type { UserStats } from "@/app/components/AuthProvider";
import {
  MockAccountCapability,
  PreAuthMobileAccountCapability,
} from "@/mobile/src/adapters/account/mobile-account-capability";

export interface AccountActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  data?: {
    user?: UserStats;
    isCurrent?: boolean;
    [key: string]: unknown;
  };
}

export interface AccountCapability {
  updateAccount: (payload: {
    username?: string;
    name?: string;
    email?: string;
    timezone?: string;
  }) => Promise<AccountActionResult>;

  sendEmailVerification: () => Promise<AccountActionResult>;

  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<AccountActionResult>;

  sendSecurityCode: (action: "RESET_PROGRESS" | "DELETE_ACCOUNT") => Promise<AccountActionResult>;

  resetProgress: (payload: { code?: string; password?: string }) => Promise<AccountActionResult>;

  deleteAccount: (payload: { code?: string; password?: string }) => Promise<AccountActionResult>;

  revokeSession: (sessionId: string) => Promise<AccountActionResult>;

  disconnectProvider: (providerId: string) => Promise<AccountActionResult>;

  logoutThisDevice: () => Promise<AccountActionResult>;

  logoutAllDevices: (password: string) => Promise<AccountActionResult>;
}

/**
 * Default production Web capability — executes standard fetch calls to Route Handlers.
 */
class WebProductionAccountCapability implements AccountCapability {
  async updateAccount(payload: {
    username?: string;
    name?: string;
    email?: string;
    timezone?: string;
  }): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/user/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error, data };
    } catch {
      return { ok: false, error: "Network error. Failed to update account." };
    }
  }

  async sendEmailVerification(): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/auth/verify-email/send", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error };
    } catch {
      return { ok: false, error: "Network error. Failed to send verification email." };
    }
  }

  async changePassword(payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/user/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "password", ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error };
    } catch {
      return { ok: false, error: "Network error. Failed to update password." };
    }
  }

  async sendSecurityCode(action: "RESET_PROGRESS" | "DELETE_ACCOUNT"): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/user/security/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error };
    } catch {
      return { ok: false, error: "Network error. Failed to send verification code." };
    }
  }

  async resetProgress(payload: { code?: string; password?: string }): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/user/reset-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error };
    } catch {
      return { ok: false, error: "Network error. Failed to reset progression." };
    }
  }

  async deleteAccount(payload: { code?: string; password?: string }): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/user/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error };
    } catch {
      return { ok: false, error: "Network error. Could not delete account." };
    }
  }

  async revokeSession(sessionId: string): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/user/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error, data };
    } catch {
      return { ok: false, error: "Network error. Failed to revoke session." };
    }
  }

  async disconnectProvider(providerId: string): Promise<AccountActionResult> {
    try {
      const res = await fetch(`/api/user/connections/${encodeURIComponent(providerId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error };
    } catch {
      return { ok: false, error: "Network error. Failed to disconnect account." };
    }
  }

  async logoutThisDevice(): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      return { ok: res.ok };
    } catch {
      return { ok: true }; // Proceed locally on network failure
    }
  }

  async logoutAllDevices(password: string): Promise<AccountActionResult> {
    try {
      const res = await fetch("/api/auth/logout-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message, error: data.error };
    } catch {
      return { ok: false, error: "Network error. Could not revoke all sessions." };
    }
  }
}

function resolveDefaultCapability(): AccountCapability {
  const isMobile =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __SYLF_MOBILE_PLATFORM__?: boolean }).__SYLF_MOBILE_PLATFORM__);

  if (isMobile) {
    const isMock =
      (typeof window !== "undefined" && Boolean((window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__)) ||
      (typeof process !== "undefined" && process.env?.VITE_ENABLE_MOCK_API === "true");

    if (isMock) {
      return new MockAccountCapability();
    }
    return new PreAuthMobileAccountCapability();
  }

  return new WebProductionAccountCapability();
}

// Active singleton instance
let activeAccountCapability: AccountCapability | null = null;

/**
 * Returns the current active account capability handler.
 * Automatically resolves environment-specific capability if not explicitly overridden:
 * - Mobile Platform (Mock Enabled) -> MockAccountCapability
 * - Mobile Platform (Normal Pre-Auth) -> PreAuthMobileAccountCapability (FAILS CLOSED)
 * - Web Environment -> WebProductionAccountCapability
 */
export function getAccountCapability(): AccountCapability {
  if (!activeAccountCapability) {
    activeAccountCapability = resolveDefaultCapability();
  }
  return activeAccountCapability;
}

/**
 * Overrides the active capability handler (used by test harnesses or mock initializers).
 */
export function setAccountCapability(capability: AccountCapability | null): void {
  activeAccountCapability = capability;
}
