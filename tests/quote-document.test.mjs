import assert from "node:assert/strict"
import path from "node:path"
import { after, test } from "node:test"
import { createServer } from "vite"

// PDF.js's Node entry installs the DOM geometry polyfills used by its browser entry.
await import("pdfjs-dist/legacy/build/pdf.mjs")
globalThis.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.mjs")
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { "@": path.resolve("src") } }, logLevel: "error" })
after(() => { delete globalThis.pdfjsWorker; return server.close() })
const { readQuotePdf } = await server.ssrLoadModule(path.resolve("src", "data", "quote-document.ts"))

function pdfFile(pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  for (const text of pages) {
    const commands = text ? `BT /F1 12 Tf 50 750 Td 16 TL ${text.split("\n").map((line) => `(${line.replace(/[\\()]/g, "\\$&")}) Tj T*`).join("\n")} ET` : ""
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`)
  }
  let content = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(content))
    content += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const start = Buffer.byteLength(content)
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return new File([content], "synthetic-vendor-quote.pdf", { type: "application/pdf" })
}

const quote = "Acme Office Supplies\nQuote Q-2026-101\nCurrency USD\nItem 1000 Surface Pro; quantity 25 ea.\nUnit price 1120.00 per 1 ea.\nNet amount 27160.00 USD; lead time 12 days."

test("real PDF parser preserves quote text and separate page references", async () => {
  const result = await readQuotePdf(pdfFile([quote, "Payment Net45. Delivery terms DDP. Valid until 2026-11-30."]))
  assert.equal(result.kind, "pdf")
  assert.equal(result.name, "synthetic-vendor-quote.pdf")
  assert.deepEqual(result.sources.map((source) => source.page), [1, 2])
  assert.match(result.sources[0].text, /Acme Office Supplies/)
  assert.match(result.sources[0].text, /1120\.00/)
  assert.match(result.sources[0].text, /27160\.00 USD/)
  assert.match(result.sources[1].text, /Payment Net45/)
})

test("real PDF parser blocks a blank page instead of exporting partial text", async () => {
  await assert.rejects(readQuotePdf(pdfFile([quote, ""])), /OCR/)
})

test("real PDF parser enforces the page limit without silently dropping pages", async () => {
  await assert.rejects(readQuotePdf(pdfFile(Array.from({ length: 21 }, () => quote))), /more than 20 pages/)
})

test("real PDF parser rejects corrupt documents with an explicit recovery message", async () => {
  await assert.rejects(readQuotePdf(new File(["%PDF-1.4\nnot a valid document"], "corrupt.pdf")), /Cannot read this PDF:.*malformed/)
})

test("PDF reader validates extension, size and file signature before parsing", async () => {
  for (const file of [
    new File([quote], "quote.txt"),
    new File([], "empty.pdf"),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "oversized.pdf"),
  ]) await assert.rejects(readQuotePdf(file), /nonempty PDF no larger than 5 MB/)
  await assert.rejects(readQuotePdf(new File([quote], "not-really.pdf")), /not a PDF/)
})

test("PDF reader respects cancellation before starting parsing", async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(readQuotePdf(pdfFile([quote]), controller.signal), { name: "AbortError" })
})
