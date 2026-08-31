/**
 * The worker build ships no types. It is imported purely so the bundler traces
 * it and so its message handler can be handed to pdf.js directly.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
