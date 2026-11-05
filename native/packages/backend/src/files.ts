// A file the person chose, in the one shape the app passes around. On a device it is a local URI that React Native's FormData reads itself. On the web
// and in Electron the picker hands over a real Blob. Nothing here reads or keeps the contents: the file goes from the device to the server.
export interface PickedFile { uri: string; name: string; mimeType: string; size?: number; blob?: Blob }

/** Adds a picked file to a multipart body, the way each runtime wants it. */
export function appendFile(form: FormData, field: string, file: PickedFile) {
  if (file.blob) form.append(field, file.blob, file.name);
  else form.append(field, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
}
