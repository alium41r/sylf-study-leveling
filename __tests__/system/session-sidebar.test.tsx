import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SessionSidebar, { SystemChatSession } from "@/app/system/components/SessionSidebar";

function generateMockSessions(count: number): SystemChatSession[] {
  const now = new Date();
  const sessions: SystemChatSession[] = [];
  
  for (let i = 1; i <= count; i++) {
    // Generate dates: some today, some yesterday, some this week, some older
    let date: Date;
    if (i <= 5) {
      date = new Date(now.getTime() - i * 3600 * 1000); // Today (hours ago)
    } else if (i <= 10) {
      date = new Date(now.getTime() - 24 * 3600 * 1000 - i * 1800 * 1000); // Yesterday
    } else if (i <= 20) {
      date = new Date(now.getTime() - 3 * 24 * 3600 * 1000 - i * 3600 * 1000); // Previous 7 days
    } else {
      date = new Date(now.getTime() - 14 * 24 * 3600 * 1000 - i * 3600 * 1000); // Older
    }

    const titles = [
      "Quantum Mechanics & Schrödinger Wave Equations Deep Dive with Multi-Step Boundary Value Problem Derivations",
      "Organic Chemistry: Advanced Electrophilic Aromatic Substitution Mechanisms & Synthesis Pathways for Polycyclic Aromatics",
      "Neuroscience & Synaptic Plasticity in Long-Term Potentiation Pathways",
      "Calculus III: Vector Calculus, Stokes Theorem, and Divergence Theorem Verification with Proofs",
      "Cellular Respiration and Oxidative Phosphorylation Chemiosmosis Regulation",
      "Linear Algebra: Singular Value Decomposition and Principal Component Analysis Mathematical Foundations",
    ];

    sessions.push({
      id: i,
      title: `${titles[(i - 1) % titles.length]} (Session #${i})`,
      updatedAt: date.toISOString(),
    });
  }

  return sessions;
}

describe("SessionSidebar (Redesigned)", () => {
  it("renders the empty state cleanly without duplicate CTA buttons", () => {
    const onCreateNew = vi.fn();
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();

    render(
      <SessionSidebar
        sessions={[]}
        activeSessionId={null}
        isOpen={true}
        onToggle={onToggle}
        onCreateNew={onCreateNew}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
      />
    );

    // Title & count badge (found in both mobile drawer & desktop rail)
    expect(screen.getAllByText("Archives").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);

    // Single source of truth for creating a new session (per container)
    const newButtons = screen.getAllByRole("button", { name: /new/i });
    expect(newButtons.length).toBe(2); // 1 mobile, 1 desktop

    // Informational empty state without duplicate button
    expect(screen.getAllByText("No Archives Yet").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Your study discussions and intelligence quests will be preserved here/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Start First Chat")).toBeNull();

    // Clicking New in header works
    fireEvent.click(newButtons[0]);
    expect(onCreateNew).toHaveBeenCalledTimes(1);

    // Close button triggers onToggle
    const closeButtons = screen.getAllByRole("button", { name: "Close Archives" });
    fireEvent.click(closeButtons[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("handles a heavily populated state (35 sessions) with long titles and date groups", () => {
    const sessions = generateMockSessions(35);
    const onSelect = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const onCreateNew = vi.fn();
    const onToggle = vi.fn();

    render(
      <SessionSidebar
        sessions={sessions}
        activeSessionId={3}
        isOpen={true}
        onToggle={onToggle}
        onCreateNew={onCreateNew}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
      />
    );

    // Verify session count
    expect(screen.getAllByText("35").length).toBeGreaterThan(0);

    // Verify date group headers
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yesterday").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Previous 7 Days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Older").length).toBeGreaterThan(0);

    // Search bar is present when sessions exist
    const searchInputs = screen.getAllByPlaceholderText("Search archives...");
    expect(searchInputs.length).toBeGreaterThan(0);

    // Test selection callback
    const session1Items = screen.getAllByTitle(sessions[0].title);
    expect(session1Items.length).toBeGreaterThan(0);
    fireEvent.click(session1Items[0]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("filters sessions in search and clears search", () => {
    const sessions = generateMockSessions(10);
    render(
      <SessionSidebar
        sessions={sessions}
        activeSessionId={null}
        isOpen={true}
        onToggle={vi.fn()}
        onCreateNew={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const searchInputs = screen.getAllByPlaceholderText("Search archives...");
    fireEvent.change(searchInputs[0], { target: { value: "Schrödinger" } });

    // Should match Schrödinger sessions
    expect(screen.getAllByText(/Schrödinger Wave Equations/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Electrophilic Aromatic/i)).toBeNull();

    // Clear search button
    const clearBtns = screen.getAllByTitle("Clear search");
    fireEvent.click(clearBtns[0]);
    expect(screen.getAllByText(/Electrophilic Aromatic/i).length).toBeGreaterThan(0);
  });

  it("supports inline rename and delete actions", () => {
    const sessions = generateMockSessions(2);
    const onRename = vi.fn();
    const onDelete = vi.fn();

    render(
      <SessionSidebar
        sessions={sessions}
        activeSessionId={null}
        isOpen={true}
        onToggle={vi.fn()}
        onCreateNew={vi.fn()}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
      />
    );

    // Find rename button for session 1
    const renameBtns = screen.getAllByRole("button", { name: `Rename ${sessions[0].title}` });
    fireEvent.click(renameBtns[0]);

    // An input should appear with the current title
    const renameInputs = screen.getAllByDisplayValue(sessions[0].title);
    expect(renameInputs.length).toBeGreaterThan(0);

    // Edit and submit
    fireEvent.change(renameInputs[0], { target: { value: "Updated Session Title" } });
    const saveBtns = screen.getAllByTitle("Save");
    fireEvent.click(saveBtns[0]);
    expect(onRename).toHaveBeenCalledWith(1, "Updated Session Title");

    // Delete
    const deleteBtns = screen.getAllByRole("button", { name: `Delete ${sessions[0].title}` });
    fireEvent.click(deleteBtns[0]);
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("robustly renders 50 sessions with extra-long titles across all date groups", () => {
    const sessions = generateMockSessions(50);
    render(
      <SessionSidebar
        sessions={sessions}
        activeSessionId={25}
        isOpen={true}
        onToggle={vi.fn()}
        onCreateNew={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Badge indicates exactly 50 sessions
    expect(screen.getAllByText("50").length).toBeGreaterThan(0);

    // Every session is rendered with truncate class and tooltip title attribute
    const firstSession = screen.getAllByTitle(sessions[0].title)[0];
    expect(firstSession).toBeDefined();
    expect(firstSession.className).toContain("truncate");

    const fiftiethSession = screen.getAllByTitle(sessions[49].title)[0];
    expect(fiftiethSession).toBeDefined();
    expect(fiftiethSession.className).toContain("truncate");

    // All date groups have their labels and counts
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yesterday").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Previous 7 Days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Older").length).toBeGreaterThan(0);
  });
});
