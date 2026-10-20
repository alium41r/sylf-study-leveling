/** User-requested portable file download. Never persists plaintext in a browser cache. */
export function downloadNotesBytes(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer], { type: "application/octet-stream" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, "_");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
