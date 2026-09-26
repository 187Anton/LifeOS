/**
 * Lokale Typdeklaration für den Main-Thread-Handler der gebündelten
 * Parserbibliothek `pdfjs-dist`.
 *
 * Die Bibliothek liefert zu `legacy/build/pdf.worker.mjs` keine eigene
 * Typdatei mit. Die Deklaration ist bewusst auf die tatsächlich genutzte
 * Schnittstelle begrenzt: Paket 7 lädt den Handler ausschließlich im
 * begrenzten PDF-Worker und ruft dort `WorkerMessageHandler.setup(...)` über
 * die Bibliothek selbst auf.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: {
    setup(handler: unknown, port: unknown): void;
  };
}
