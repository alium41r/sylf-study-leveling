import { buildAnnotatedPdf, type PdfExportJob } from "./pdf-export-core";
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PdfExportJob>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = (event) => {
  void buildAnnotatedPdf(event.data, (page, total) =>
    scope.postMessage({ progress: { page, total } })
  )
    .then((bytes) =>
      scope.postMessage({ bytes }, [bytes.buffer as ArrayBuffer])
    )
    .catch((error) =>
      scope.postMessage({
        error:
          error instanceof Error
            ? error.message
            : "PDF export failed; editable originals are retained.",
      })
    );
};
