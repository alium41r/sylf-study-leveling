import { AccountCapability, AccountActionResult } from "@/app/settings/account/services/account-capability";
import { MOCK_STUDENT_USER } from "../api/mock-api";

/**
 * Deterministic SAFE mock capability for explicit development mock builds.
 * Never touches production databases, sessions, or credentials.
 */
export class MockAccountCapability implements AccountCapability {
  async updateAccount(payload: {
    username?: string;
    name?: string;
    email?: string;
    timezone?: string;
  }): Promise<AccountActionResult> {
    const studentUser = MOCK_STUDENT_USER as unknown as Record<string, unknown>;
    if (payload.username) studentUser.username = payload.username;
    if (payload.name) studentUser.name = payload.name;
    if (payload.email) studentUser.email = payload.email;
    if (payload.timezone) studentUser.timezone = payload.timezone;

    return {
      ok: true,
      message: "Account preferences updated successfully.",
      data: {
        user: { ...MOCK_STUDENT_USER },
      },
    };
  }

  async sendEmailVerification(): Promise<AccountActionResult> {
    return {
      ok: true,
      message: `Verification link sent to ${MOCK_STUDENT_USER.email} (Mock).`,
    };
  }

  async changePassword(_payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<AccountActionResult> {
    return {
      ok: true,
      message: "Password successfully updated (Mock).",
    };
  }

  async sendSecurityCode(_action: "RESET_PROGRESS" | "DELETE_ACCOUNT"): Promise<AccountActionResult> {
    return {
      ok: true,
      message: "Verification code sent to your email (Mock: 123456).",
    };
  }

  async resetProgress(_payload: { code?: string; password?: string }): Promise<AccountActionResult> {
    return {
      ok: true,
      message: "Progress reset successfully! Starting at Level 1 (Mock).",
    };
  }

  async deleteAccount(_payload: { code?: string; password?: string }): Promise<AccountActionResult> {
    return {
      ok: true,
      message: "Account successfully deleted (Mock).",
    };
  }

  async revokeSession(_sessionId: string): Promise<AccountActionResult> {
    return {
      ok: true,
      message: "Session revoked successfully (Mock).",
    };
  }

  async disconnectProvider(_providerId: string): Promise<AccountActionResult> {
    return {
      ok: true,
      message: "Account disconnected successfully (Mock).",
    };
  }

  async logoutThisDevice(): Promise<AccountActionResult> {
    return {
      ok: true,
      message: "Logged out successfully (Mock).",
    };
  }

  async logoutAllDevices(_password: string): Promise<AccountActionResult> {
    return {
      ok: true,
      message: "All sessions revoked successfully (Mock).",
    };
  }
}

/**
 * Fail-closed capability for normal pre-auth mobile builds (mocks disabled).
 * Guarantees that pre-auth mobile builds cannot accidentally perform destructive
 * or security-sensitive actions against any configured backend.
 */
export class PreAuthMobileAccountCapability implements AccountCapability {
  private static readonly DEFERRED_ERROR =
    "This operation is unavailable: Mobile authentication and account management are deferred to Phase 2.";

  async updateAccount(_payload: {
    username?: string;
    name?: string;
    email?: string;
    timezone?: string;
  }): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async sendEmailVerification(): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async changePassword(_payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async sendSecurityCode(_action: "RESET_PROGRESS" | "DELETE_ACCOUNT"): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async resetProgress(_payload: { code?: string; password?: string }): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async deleteAccount(_payload: { code?: string; password?: string }): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async revokeSession(_sessionId: string): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async disconnectProvider(_providerId: string): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async logoutThisDevice(): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }

  async logoutAllDevices(_password: string): Promise<AccountActionResult> {
    return { ok: false, error: PreAuthMobileAccountCapability.DEFERRED_ERROR };
  }
}
