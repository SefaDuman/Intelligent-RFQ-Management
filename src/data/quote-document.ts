import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { QUOTE_LIMITS, quoteSources, type QuoteDocument } from "@/lib/quote-extraction"

export async function readQuotePdf(file: File, signal?: AbortSignal): Promise<QuoteDocument> {
  if (!/\.pdf$/i.test(file.name) || !file.size || file.size > QUOTE_LIMITS.fileBytes) throw new Error("Select a nonempty PDF no larger than 5 MB.")
  const data = new Uint8Array(await file.arrayBuffer())
  signal?.throwIfAborted()
  if (!new TextDecoder().decode(data.slice(0, 5)).startsWith("%PDF-")) throw new Error("The selected file is not a PDF.")
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  signal?.throwIfAborted()
  const task = pdfjs.getDocument({ data, disableFontFace: true, useWasm: false, useWorkerFetch: false, enableXfa: false, stopAtErrors: true })
  const abort = () => { void task.destroy() }
  signal?.addEventListener("abort", abort, { once: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages > QUOTE_LIMITS.pages) throw new Error(`PDF has more than ${QUOTE_LIMITS.pages} pages. Split it before extraction; no pages were skipped.`)
    const pages: { page: number; text: string }[] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      signal?.throwIfAborted()
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      const text = content.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("")
      pages.push({ page: number, text })
      if (pages.reduce((sum, item) => sum + item.text.length, 0) > QUOTE_LIMITS.characters) throw new Error("PDF text is too large. Split the document before extraction.")
      page.cleanup()
    }
    return { name: file.name, kind: "pdf", sources: quoteSources(pages) }
  } catch (cause) {
    signal?.throwIfAborted()
    throw new Error(`Cannot read this PDF: ${cause instanceof Error ? cause.message : String(cause)} Password-protected, malformed or scanned PDFs need an unlocked text-based copy or verified pasted text.`)
  } finally {
    signal?.removeEventListener("abort", abort)
    await task.destroy()
  }
}
