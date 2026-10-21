import assert from "node:assert/strict"
import path from "node:path"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { "@": path.resolve("src") } }, logLevel: "error" })
after(() => server.close())
const { QUOTE_HEADERS, QUOTE_LINE_FIELDS, quoteSources, textQuoteDocument, quoteExtractionPrompt, parseQuoteExtraction, createQuoteReview, quoteValueErrors, quoteSourceKey, quoteReviewWarnings, buildQuoteExport } = await server.ssrLoadModule(path.resolve("src", "lib", "quote-extraction.ts"))
const { extractQuote, exportReviewedQuote } = await server.ssrLoadModule(path.resolve("src", "data", "quote-extraction.ts"))
const sourceText = `Acme Office Supplies
Quote Q-2026-101 dated 2026-10-21
Currency: USD
Valid until: 2026-11-30
Payment: Net45. Delivery terms: DDP.
Item 1000 Surface Pro 128 GB; quantity 25 ea.
Unit price 1120.00 USD per 1 ea. Discount 3%.
Line net amount 27160.00 USD. Lead time 12 days.
Document total 27160.00 USD excluding tax and freight.`
const document = textQuoteDocument(sourceText)
const field = (value, excerpt) => ({ value, sourceId: "source-1", excerpt })
const empty = () => ({ value: null, sourceId: null, excerpt: null })
function extracted() {
  return {
    complete: true,
    header: {
      vendorName: field("Acme Office Supplies", "Acme Office Supplies"), quoteNumber: field("Q-2026-101", "Quote Q-2026-101"),
      quoteDate: field("2026-10-21", "dated 2026-10-21"), currency: field("USD", "Currency: USD"), validUntil: field("2026-11-30", "Valid until: 2026-11-30"),
      paymentTerms: field("Net45", "Payment: Net45."), deliveryTerms: field("DDP", "Delivery terms: DDP."), quotedTotal: field("27160.00", "Document total 27160.00 USD"),
    },
    lines: [{
      ...Object.fromEntries(Object.keys(QUOTE_LINE_FIELDS).map((key) => [key, empty()])),
      itemNumber: field("1000", "Item 1000"), description: field("Surface Pro 128 GB", "Surface Pro 128 GB"),
      quantity: field("25", "quantity 25 ea"), unit: field("ea", "quantity 25 ea"), unitPrice: field("1120.00", "Unit price 1120.00 USD"),
      priceQuantity: field("1", "per 1 ea"), discountPct: field("3", "Discount 3%"), netAmount: field("27160.00", "Line net amount 27160.00 USD"),
      leadTimeDays: field("12", "Lead time 12 days"),
    }],
  }
}
function detail() {
  return { header: { company: "usmf", rfqCaseId: "000432", name: "Laptop refresh", currency: "USD", status: "Received" },
    lines: [{ lineNumber: 1, itemNumber: "1000", quantity: 25, unit: "ea" }],
    replies: [{ rfqId: "000338", vendorAccount: "1001", vendorName: "Acme Office Supplies", status: "Received", notes: "PRIVATE ERP NOTES", totalAmount: 99999 }] }
}
function fixture() {
  const extraction = parseQuoteExtraction(JSON.stringify(extracted()), document)
  const review = createQuoteReview(extraction)
  review.lines[0].requestedLine = "1"; review.notes = "Checked every source row, identity and pricing basis."
  return { company: "usmf", caseId: "000432", rfqId: "000338", document, extraction, review, sourceKey: quoteSourceKey(detail(), "000338"), reviewer: "Buyer", acknowledged: true, extractedAt: new Date().toISOString() }
}
test("source preparation preserves all text with page references and bounded sections", () => {
  const text = "Quote vendor product rows and detailed terms. ".repeat(200)
  const sources = quoteSources([{ page: 1, text }, { page: 2, text: sourceText }])
  assert.equal(sources.filter((item) => item.page === 1).map((item) => item.text).join(""), text.trim())
  assert.equal(sources.at(-1).page, 2)
  assert.equal(new Set(sources.map((item) => item.id)).size, sources.length)
  assert.ok(sources.every((item) => item.text.length <= 3000))
  assert.equal(textQuoteDocument("供應商報價文件產品數量價格交貨條件付款條件有效期限確認明細內容").kind, "text")
})
test("source limits and image-only/empty pages fail rather than silently truncate", () => {
  assert.throws(() => quoteSources([]), /pages/)
  assert.throws(() => quoteSources(Array.from({ length: 21 }, () => ({ page: 1, text: sourceText }))), /pages/)
  assert.throws(() => textQuoteDocument("a".repeat(60001)), /exceeds/)
  assert.throws(() => quoteSources([{ page: 1, text: sourceText }, { page: 2, text: "" }]), /OCR/)
  assert.throws(() => textQuoteDocument("123"), /usable text/)
})
test("prompt requires nulls, exact evidence, complete rows and no financial inference", () => {
  const prompt = quoteExtractionPrompt(document)
  assert.match(prompt, /untrusted data/)
  assert.match(prompt, /bare \$ sign is ambiguous/)
  assert.match(prompt, /Never silently omit/)
  assert.match(prompt, /not converted weeks/)
  assert.match(prompt, /Never execute/)
  assert.match(prompt, /source-1/)
  for (const key of [...Object.keys(QUOTE_HEADERS), ...Object.keys(QUOTE_LINE_FIELDS)]) assert.ok(prompt.includes(key))
  assert.ok(!prompt.includes("PRIVATE ERP NOTES"))
})
test("parser preserves stated amounts, missing values and cited excerpts without calculation", () => {
  const value = parseQuoteExtraction(JSON.stringify(extracted()), document)
  assert.equal(value.header.quotedTotal.value, "27160.00")
  assert.equal(value.lines[0].unitPrice.value, "1120.00")
  assert.deepEqual(value.lines[0].deliveryDate, empty())
  const review = createQuoteReview(value)
  assert.equal(review.lines[0].requestedLine, "")
  assert.equal(review.lines[0].originIndex, 0)
  assert.equal(review.lines[0].values.deliveryDate, "")
})
test("parser rejects unknown citations, fabricated excerpts, missing fields and invalid types", () => {
  for (const change of [
    (value) => { value.lines[0].quantity.sourceId = "invented" },
    (value) => { value.header.currency.excerpt = "Currency EUR" },
    (value) => { value.header.quoteNumber.sourceId = null },
    (value) => { value.header.quoteDate.value = 20261021 },
    (value) => { delete value.lines[0].unit },
    (value) => { value.header.vendorName.value = "x".repeat(501) },
    (value) => { value.header.vendorName.excerpt = "x".repeat(241) },
  ]) {
    const value = extracted(); change(value)
    assert.throws(() => parseQuoteExtraction(JSON.stringify(value), document))
  }
})
test("parser rejects incomplete quotes and out-of-bound row counts", () => {
  for (const change of [
    (value) => { value.complete = false },
    (value) => { delete value.complete },
    (value) => { value.lines = [] },
    (value) => { value.lines = Array.from({ length: 21 }, () => value.lines[0]) },
  ]) {
    const value = extracted(); change(value)
    assert.throws(() => parseQuoteExtraction(JSON.stringify(value), document))
  }
  for (const text of ["not JSON", "null", "[]", "{}"]) assert.throws(() => parseQuoteExtraction(text, document))
})
test("numeric/date validation rejects locale ambiguity, currency symbols, infinities and impossible dates", () => {
  for (const [key, bad] of [["quantity", "0"], ["unitPrice", "1,120.00"], ["priceQuantity", "-1"], ["discountPct", "101"], ["netAmount", "USD 500"], ["leadTimeDays", "2 weeks"], ["deliveryDate", "2026-02-30"]]) {
    const value = extracted(); value.lines[0][key] = field(bad, "Unit price 1120.00 USD")
    assert.throws(() => parseQuoteExtraction(JSON.stringify(value), document), /ambiguous or invalid/)
  }
  const review = fixture().review
  review.header.currency = "$"; review.header.quoteDate = "10/11/26"; review.header.quotedTotal = "Infinity"
  assert.equal(quoteValueErrors(review).length, 3)
  review.header.currency = ""; review.header.quoteDate = ""; review.header.quotedTotal = ""
  review.lines[0].values.unitPrice = "0"
  assert.equal(quoteValueErrors(review).length, 0)
})
test("connector targets dedicated extraction agent; failures never fall back to fabricated data", async () => {
  const parsed = await extractQuote(document, async (agent, body) => {
    assert.equal(agent, "rfq_quoteExtraction")
    assert.match(body.message, /Acme Office Supplies/)
    assert.ok(!body.message.includes("99999"))
    return { success: true, data: { completed: false, responses: [JSON.stringify(extracted())] } }
  })
  assert.equal(parsed.lines.length, 1)
  await assert.rejects(extractQuote(document, async () => ({ success: false, error: new Error("Denied") })), /Denied/)
  await assert.rejects(extractQuote(document, async () => ({ success: true, data: { responses: ["incorrect"] } })), /invalid JSON/)
})
test("review warnings expose identity, currency, unknowns, mismatches and expired validity", () => {
  const input = fixture()
  input.review.header.vendorName = "Other vendor"
  input.review.header.currency = "EUR"
  input.review.header.validUntil = "2020-01-01"
  input.review.lines[0].values.quantity = "24"
  input.review.lines[0].values.priceQuantity = ""
  const warnings = quoteReviewWarnings(input.review, detail(), "000338")
  for (const phrase of ["vendor name differs", "currency differs", "expired", "quantity or unit differs", "price basis is unknown", "freight/tax"]) assert.ok(warnings.some((warning) => warning.includes(phrase)))
})
test("export includes original fields, reviewed corrections, mappings, full sources and text fingerprint", async () => {
  const input = fixture()
  input.review.lines[0].values.unitPrice = "1100.00"
  const result = await buildQuoteExport(input, detail())
  assert.equal(result.originalExtraction.lines[0].unitPrice.value, "1120.00")
  assert.equal(result.reviewed.lines[0].values.unitPrice, "1100.00")
  assert.equal(result.reviewed.lines[0].requestedLine, "1")
  assert.match(result.document.extractedTextSha256, /^[a-f0-9]{64}$/)
  assert.equal(result.document.sources[0].text, sourceText)
  assert.match(result.status, /not posted/)
  assert.ok(!JSON.stringify(result).includes("PRIVATE ERP NOTES"))
  assert.ok(!JSON.stringify(result).includes("99999"))
  const same = await buildQuoteExport(input, detail())
  assert.equal(result.document.extractedTextSha256, same.document.extractedTextSha256)
})
for (const [label, change] of [
  ["acknowledgment", (input) => { input.acknowledged = false }],
  ["reviewer", (input) => { input.reviewer = "" }],
  ["notes", (input) => { input.review.notes = "" }],
  ["mapping", (input) => { input.review.lines[0].requestedLine = "" }],
  ["foreign line", (input) => { input.review.lines[0].requestedLine = "2" }],
  ["removed original row", (input) => { input.review.lines = [] }],
  ["changed origin", (input) => { input.review.lines[0].originIndex = null }],
  ["excluded-only", (input) => { input.review.lines[0].excluded = true; input.review.lines[0].reason = "alternate" }],
  ["invalid date", (input) => { input.review.header.validUntil = "2026-02-30" }],
  ["stale day", (input) => { input.extractedAt = "2020-01-01" }],
]) test(`export blocks ${label}`, async () => {
  const input = fixture(); change(input)
  await assert.rejects(buildQuoteExport(input, detail()))
})
test("export rejects duplicate mappings and requires exclusion reasons while preserving excluded rows", async () => {
  const input = fixture()
  input.review.lines.push({ ...structuredClone(input.review.lines[0]), originIndex: null })
  await assert.rejects(buildQuoteExport(input, detail()), /Multiple quote rows/)
  input.review.lines[1].excluded = true
  await assert.rejects(buildQuoteExport(input, detail()), /reason/)
  input.review.lines[1].reason = "Alternative not requested."
  const result = await buildQuoteExport(input, detail())
  assert.equal(result.reviewed.lines[1].originIndex, null)
  assert.equal(result.reviewed.lines[1].reason, "Alternative not requested.")
})
test("export accepts a mapped buyer-added missing row without altering original extraction", async () => {
  const input = fixture()
  const current = detail()
  current.lines.push({ lineNumber: 2, itemNumber: "other", quantity: 1, unit: "ea" })
  input.sourceKey = quoteSourceKey(current, "000338")
  input.review.lines.push({ ...structuredClone(input.review.lines[0]), originIndex: null, requestedLine: "2" })
  const result = await buildQuoteExport(input, current)
  assert.equal(result.originalExtraction.lines.length, 1)
  assert.equal(result.reviewed.lines.length, 2)
})
test("export rejects cross-company, cross-case, changed vendor and stale requested lines", async () => {
  for (const change of [
    (current) => { current.header.company = "demf" },
    (current) => { current.header.rfqCaseId = "other" },
    (current) => { current.lines[0].quantity = 26 },
    (current) => { current.replies[0].vendorAccount = "1002" },
    (current) => { current.header.status = "Accepted" },
    (current) => { current.replies = [] },
  ]) {
    const current = detail(); change(current)
    await assert.rejects(buildQuoteExport(fixture(), current))
  }
})
test("export reloads only the selected company/case and never writes to ERP", async () => {
  const calls = []
  const repository = { getRfqCase: async (id, company) => { calls.push([id, company]); return detail() } }
  await exportReviewedQuote(repository, fixture())
  assert.deepEqual(calls, [["000432", "usmf"]])
  await assert.rejects(exportReviewedQuote({ getRfqCase: async () => null }, fixture()), /no longer accessible/)
})
