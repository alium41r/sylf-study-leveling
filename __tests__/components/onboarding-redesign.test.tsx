/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OnboardingProgress } from "@/app/onboarding/components/OnboardingProgress";
import { WelcomeStep } from "@/app/onboarding/components/WelcomeStep";
import { IdentityFields } from "@/app/onboarding/components/IdentityFields";
import { SubjectsStep, ConfiguredSubject } from "@/app/onboarding/components/SubjectsStep";
import { AppearanceStep } from "@/app/onboarding/components/AppearanceStep";
import OnboardingFlow from "@/app/onboarding/page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
}));

// Mock AuthProvider
const mockLogin = vi.fn();
const mockRefreshStats = vi.fn().mockResolvedValue({});
let mockUser: any = {
  id: 1,
  email: "scholar@sylf.app",
  name: "Scholar",
  username: "scholar_1",
  hasPassword: true,
  hasCompletedOnboarding: false,
};

vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: mockUser,
    login: mockLogin,
    refreshStats: mockRefreshStats,
  }),
}));

// Mock GlobalSystemWrapper utilities
vi.mock("@/app/components/GlobalSystemWrapper", () => ({
  applyAppMode: vi.fn(),
  applyGlobalTheme: vi.fn(),
  applyGlobalBackground: vi.fn(),
  THEME_MAP: {},
  BG_MAP: {},
}));

describe("Onboarding Redesign Components & Accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OnboardingProgress", () => {
    it("renders progress navigation with accessible step states", () => {
      render(<OnboardingProgress currentStep="SUBJECTS" />);
      const nav = screen.getByRole("navigation", { name: /onboarding progress/i });
      expect(nav).toBeInTheDocument();

      const welcome = screen.getByText("Welcome").closest("li");
      const subjects = screen.getByText("Subjects").closest("li");
      const appearance = screen.getByText("Appearance").closest("li");

      expect(subjects).toHaveAttribute("aria-current", "step");
      expect(welcome).not.toHaveAttribute("aria-current");
      expect(appearance).not.toHaveAttribute("aria-current");
    });
  });

  describe("WelcomeStep", () => {
    it("renders companion, loop cards, and primary continue CTA", () => {
      const handleNext = vi.fn();
      render(
        <WelcomeStep
          isGoogleSignup={false}
          name="Scholar"
          username="scholar_1"
          usernameStatus="available"
          usernameMsg=""
          onNameChange={vi.fn()}
          onUsernameChange={vi.fn()}
          onNext={handleNext}
        />
      );

      // Core value proposition
      expect(screen.getByText("Welcome to Sylf")).toBeInTheDocument();
      expect(screen.getByText("1. Focus")).toBeInTheDocument();
      expect(screen.getByText("2. Quests")).toBeInTheDocument();
      expect(screen.getByText("3. Level Up")).toBeInTheDocument();

      // CTA button
      const continueBtn = screen.getByRole("button", { name: /continue to subjects/i });
      expect(continueBtn).toBeEnabled();
      fireEvent.click(continueBtn);
      expect(handleNext).toHaveBeenCalledTimes(1);
    });

    it("renders identity fields for Google OAuth users with validation gating", () => {
      const handleNext = vi.fn();
      const { rerender } = render(
        <WelcomeStep
          isGoogleSignup={true}
          email="google_user@gmail.com"
          name=""
          username=""
          usernameStatus="idle"
          usernameMsg=""
          onNameChange={vi.fn()}
          onUsernameChange={vi.fn()}
          onNext={handleNext}
        />
      );

      const continueBtn = screen.getByRole("button", { name: /continue to subjects/i });
      expect(continueBtn).toBeDisabled();

      // Rerender with valid handle and name
      rerender(
        <WelcomeStep
          isGoogleSignup={true}
          email="google_user@gmail.com"
          name="Sung Jin-Woo"
          username="jinwoo"
          usernameStatus="available"
          usernameMsg="✓ Handle is available"
          onNameChange={vi.fn()}
          onUsernameChange={vi.fn()}
          onNext={handleNext}
        />
      );

      expect(continueBtn).toBeEnabled();
      fireEvent.click(continueBtn);
      expect(handleNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("IdentityFields Accessibility", () => {
    it("associates labels with inputs and provides accessible password toggle", () => {
      const togglePasswordSpy = vi.fn();
      render(
        <IdentityFields
          email="user@test.com"
          name="Test User"
          username="test_user"
          password="password123"
          showPassword={false}
          usernameStatus="available"
          usernameMsg="✓ Available"
          onNameChange={vi.fn()}
          onUsernameChange={vi.fn()}
          onPasswordChange={vi.fn()}
          onToggleShowPassword={togglePasswordSpy}
        />
      );

      // Label associations
      expect(screen.getByLabelText(/display name/i)).toHaveValue("Test User");
      expect(screen.getByLabelText(/scholar handle/i)).toHaveValue("test_user");
      expect(screen.getByLabelText(/security password/i)).toHaveValue("password123");

      // Password toggle button accessible attributes
      const toggleBtn = screen.getByRole("button", { name: /show password/i });
      expect(toggleBtn).toBeInTheDocument();
      fireEvent.click(toggleBtn);
      expect(togglePasswordSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("SubjectsStep", () => {
    it("allows adding popular subjects with one tap via quick-add chips", () => {
      const updateSubjectsSpy = vi.fn();
      render(
        <SubjectsStep
          subjects={[]}
          onUpdateSubjects={updateSubjectsSpy}
          onNext={vi.fn()}
          onPrev={vi.fn()}
        />
      );

      const mathChip = screen.getByRole("button", { name: /mathematics/i });
      expect(mathChip).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(mathChip);
      expect(updateSubjectsSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "Mathematics", code: "MATH" }),
        ])
      );
    });

    it("allows adding custom subjects without requiring a syllabus code", () => {
      let subjectsState: ConfiguredSubject[] = [];
      const updateSubjectsSpy = vi.fn((newSubs) => {
        subjectsState = newSubs;
      });

      render(
        <SubjectsStep
          subjects={subjectsState}
          onUpdateSubjects={updateSubjectsSpy}
          onNext={vi.fn()}
          onPrev={vi.fn()}
        />
      );

      const nameInput = screen.getByLabelText(/subject name/i);
      const codeInput = screen.getByLabelText(/code/i);
      const addBtn = screen.getByRole("button", { name: /add to curriculum/i });

      // Enter name without code
      fireEvent.change(nameInput, { target: { value: "Organic Chemistry" } });
      expect(codeInput).toHaveValue("");

      fireEvent.click(addBtn);

      expect(updateSubjectsSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Organic Chemistry",
            code: undefined,
          }),
        ])
      );
    });

    it("gates the Continue button until at least one subject is added", () => {
      const handleNext = vi.fn();
      const { rerender } = render(
        <SubjectsStep
          subjects={[]}
          onUpdateSubjects={vi.fn()}
          onNext={handleNext}
          onPrev={vi.fn()}
        />
      );

      const continueBtn = screen.getByRole("button", { name: /continue to appearance/i });
      expect(continueBtn).toBeDisabled();

      // Add a subject
      rerender(
        <SubjectsStep
          subjects={[{ id: "s1", name: "Physics", color: "#8b5cf6" }]}
          onUpdateSubjects={vi.fn()}
          onNext={handleNext}
          onPrev={vi.fn()}
        />
      );

      expect(continueBtn).toBeEnabled();
      fireEvent.click(continueBtn);
      expect(handleNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("AppearanceStep", () => {
    it("renders radio groups for mode and accent presets with accessible semantics", () => {
      const selectModeSpy = vi.fn();
      const selectAccentSpy = vi.fn();
      const handleNext = vi.fn();

      render(
        <AppearanceStep
          selectedMode="dark"
          selectedAccent="#7c3aed"
          selectedBackground="void"
          onSelectMode={selectModeSpy}
          onSelectAccent={selectAccentSpy}
          onSelectBackground={vi.fn()}
          onNext={handleNext}
          onPrev={vi.fn()}
        />
      );

      // Dark mode radio
      const darkRadio = screen.getByRole("radio", { name: /dark mode/i });
      expect(darkRadio).toHaveAttribute("aria-checked", "true");

      // Light mode radio
      const lightRadio = screen.getByRole("radio", { name: /light mode/i });
      expect(lightRadio).toHaveAttribute("aria-checked", "false");
      fireEvent.click(lightRadio);
      expect(selectModeSpy).toHaveBeenCalledWith("light");

      // Accent color preset radio
      const cyanAccent = screen.getByRole("radio", { name: /accent color electric cyan/i });
      expect(cyanAccent).toHaveAttribute("aria-checked", "false");
      fireEvent.click(cyanAccent);
      expect(selectAccentSpy).toHaveBeenCalledWith("#06b6d4");

      // Complete setup button starts enabled immediately with defaults
      const completeBtn = screen.getByRole("button", { name: /complete setup/i });
      expect(completeBtn).toBeEnabled();
      fireEvent.click(completeBtn);
      expect(handleNext).toHaveBeenCalledTimes(1);
    });
  });
});
