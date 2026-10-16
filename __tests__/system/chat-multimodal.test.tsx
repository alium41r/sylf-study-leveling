import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatComposer from "@/app/components/system/chat/ChatComposer";
import { useComposerImages } from "@/app/components/system/chat/useComposerImages";
import { useSylvieChat } from "@/app/components/system/chat/useSylvieChat";

type Result = { isFinal: boolean; 0: { transcript: string } };
class BrowserSpeech {
  static instances: BrowserSpeech[] = [];
  static available = vi.fn(async () => "available");
  lang = ""; continuous = false; interimResults = false; processLocally = false;
  onstart: (() => void) | null = null; onend: (() => void) | null = null; onspeechend: (() => void) | null = null;
  onresult: ((event: { results: Result[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  start = vi.fn(() => this.onstart?.()); stop = vi.fn(); abort = vi.fn();
  constructor() { BrowserSpeech.instances.push(this); }
  results(text: string, isFinal = true) { this.onresult?.({ results: [{ isFinal, 0: { transcript: text } }] }); }
}
const sent = vi.fn(), revoked = vi.fn();
function Composer({ reset = 0, disabled = false, maxLength = 4000, initial = "Explain" }) {
  const [value, setValue] = useState(initial); const images = useComposerImages(reset);
  return <ChatComposer key={reset} resetKey={reset} value={value} onChange={setValue} onSend={sent} busy={false} disabled={disabled} maxLength={maxLength}
    images={images.images} onFilesAdded={images.addFiles} onImageRemove={images.remove} imageError={images.error} />;
}
const current = () => BrowserSpeech.instances.at(-1)!;
beforeEach(() => {
  BrowserSpeech.instances = []; BrowserSpeech.available.mockResolvedValue("available"); sent.mockClear(); revoked.mockClear();
  vi.stubGlobal("SpeechRecognition", BrowserSpeech); vi.stubGlobal("webkitSpeechRecognition", undefined);
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => `blob:synthetic-${Math.random()}`); static revokeObjectURL = revoked; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("shared editable dictation", () => {
  it("uses available on-device recognition, preserves the existing draft and never sends automatically", async () => {
    render(<Composer />); fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(current().start).toHaveBeenCalledOnce());
    expect(current().processLocally).toBe(true); expect(screen.getByRole("status")).toHaveTextContent("Listening… · On device");
    act(() => current().results("the equation", false)); expect(screen.getByRole("textbox")).toHaveValue("Explain the equation");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" }); expect(sent).not.toHaveBeenCalled();
    act(() => current().results("the equation carefully."));
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    expect(screen.getByRole("status")).toHaveTextContent("Processing speech");
    act(() => current().onend?.());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Explain the equation briefly." } });
    expect(screen.getByRole("textbox")).toHaveValue("Explain the equation briefly."); expect(sent).not.toHaveBeenCalled();
  });
  it("supports prefixed browser recognition, discloses service use, and cancels without losing typed text", async () => {
    vi.stubGlobal("SpeechRecognition", undefined); vi.stubGlobal("webkitSpeechRecognition", BrowserSpeech);
    BrowserSpeech.available.mockResolvedValue("downloadable");
    render(<Composer />); fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(current().start).toHaveBeenCalledOnce());
    expect(current().processLocally).toBe(false); expect(screen.getByRole("status")).toHaveTextContent("Browser speech service");
    act(() => current().results("unwanted words", false));
    fireEvent.click(screen.getByRole("button", { name: "Cancel dictation" }));
    expect(screen.getByRole("textbox")).toHaveValue("Explain"); expect(current().abort).toHaveBeenCalledOnce();
    expect(current().onresult).toBeNull();
  });
  it("reports permission/network failures and permits an explicit retry", async () => {
    render(<Composer />); fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(current().start).toHaveBeenCalledOnce());
    act(() => current().onerror?.({ error: "not-allowed" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access was denied"); expect(screen.getByRole("textbox")).toHaveValue("Explain");
    fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(BrowserSpeech.instances).toHaveLength(2));
    act(() => current().onerror?.({ error: "network" }));
    expect(screen.getByRole("alert")).toHaveTextContent("speech service couldn’t connect");
  });
  it("releases recognition on conversation switching, disabled/closed surfaces and unmount", async () => {
    const view = render(<Composer />); fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(current().start).toHaveBeenCalledOnce()); const old = current();
    view.rerender(<Composer reset={1} />); expect(old.abort).toHaveBeenCalledOnce(); expect(old.onresult).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(current().start).toHaveBeenCalledOnce());
    view.rerender(<Composer reset={1} disabled />); expect(current().abort).toHaveBeenCalledOnce();
    view.unmount(); expect(sent).not.toHaveBeenCalled();
  });
  it("respects the Planner character cap and gives unsupported browsers a keyboard fallback", async () => {
    const view = render(<Composer maxLength={12} />); fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(current().start).toHaveBeenCalledOnce());
    act(() => { current().results("a long equation"); current().onend?.(); });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value.length).toBe(12);
    expect(screen.getByRole("alert")).toHaveTextContent("12-character limit");
    view.unmount(); vi.stubGlobal("SpeechRecognition", undefined);
    render(<Composer />); expect(screen.getByRole("button", { name: "Dictate prompt" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dictate prompt" })).toHaveAttribute("title", expect.stringContaining("keyboard"));
  });
  it("bounds interrupted processing and stops a microphone when replacing an unsaved conversation", async () => {
    function Conversation() {
      const chat = useSylvieChat({}); const [value, setValue] = useState("Typed first");
      return <><button onClick={() => chat.selectSession(null)}>New conversation</button><ChatComposer key={chat.viewKey} resetKey={chat.viewKey} value={value} onChange={setValue} onSend={sent} busy={false} /></>;
    }
    render(<Conversation />); fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(current().start).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(current().abort).toHaveBeenCalledOnce(); expect(current().onresult).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dictate prompt" }));
    await waitFor(() => expect(current().start).toHaveBeenCalledOnce());
    act(() => current().results("confirmed words"));
    vi.useFakeTimers(); fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    expect(screen.getByRole("button", { name: "Stop dictation" })).toBeDisabled();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("textbox")).toHaveValue("Typed first confirmed words"); expect(current().abort).toHaveBeenCalledOnce();
    expect(sent).not.toHaveBeenCalled();
  });
});
describe("shared image drafts", () => {
  it("previews multiple images, rejects over-limit selections, and releases object URLs on removal and switching", () => {
    const view = render(<Composer initial="" />); const picker = view.container.querySelector('input[type="file"]')!;
    const files = [1,2].map(index => new File(["synthetic"], `equation-${index}.png`, { type: "image/png" }));
    fireEvent.change(picker, { target: { files } });
    expect(screen.getAllByRole("img")).toHaveLength(2); expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    fireEvent.change(picker, { target: { files: [3,4,5].map(index => new File(["synthetic"], `image-${index}.png`, { type: "image/png" })) } });
    expect(screen.getByRole("alert")).toHaveTextContent("4 images"); expect(screen.getAllByRole("img")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove equation-1.png" })); expect(revoked).toHaveBeenCalledTimes(1);
    view.rerender(<Composer reset={1} initial="" />); expect(screen.queryByRole("img")).not.toBeInTheDocument(); expect(revoked).toHaveBeenCalledTimes(2);
  });
});
