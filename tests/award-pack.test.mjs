import assert from "node:assert/strict"
import path from "node:path"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { "@": path.resolve("src") } }, logLevel: "error" })
after(() => server.close())
const { buildAwardPack, awardEvidenceKey } = await server.ssrLoadModule(path.resolve("src", "lib", "award-pack.ts"))
const now = new Date("2026-10-21T09:00:00Z")
function fixture() {
  return {
    detail: {
      header: { recordId: "case", rfqCaseId: "000432", name: "Laptops", status: "Received", company: "usmf", currency: "USD", expiryDate: "2026-10-23" },
      lines: [{ recordId: "line", rfqCaseId: "000432", lineNumber: 1, itemNumber: "1000", quantity: 25, unit: "ea" }],
      replies: [27160, 26460].map((amount, i) => ({
        recordId: `r${i}`, rfqId: `r${i}`, rfqCaseId: "000432", vendorAccount: `${i}`, vendorName: `Vendor ${i}`, status: "Received", currency: "USD", paymentTerms: "Net45",
        lines: [{ recordId: `l${i}`, rfqId: `r${i}`, lineNumber: 1, itemNumber: "1000", quantity: 25, unitPrice: amount / 25, discountPct: 0, netAmount: amount, quoted: true, leadTimeDays: i ? 20 : 12 }],
      })),
    },
    selectedIds: ["r0", "r1"], vendors: [], weights: { price: 40, delivery: 20, vendor: 20, coverage: 15, terms: 5 },
    preferredId: "r1", rationale: "Prefer lower cost; confirm validity and delivery before award.", preparedBy: "Buyer", reviewed: true,
  }
}
test("memo includes selected bids, buyer preference, score method, exceptions and evidence with no invented approval", () => {
  const input = fixture()
  const pack = buildAwardPack(input, now)
  assert.equal(pack.fileName, "RFQ-usmf-000432-award-recommendation.html")
  for (const text of ["27160.00", "26460.00", "700", "Buyer preference and justification", "Selection criteria", "quote validity not supplied", "Supporting evidence snapshot", "Not requested / not recorded", "lower-scoring offer", "No bids accepted/rejected", "r1"]) assert.ok(pack.html.includes(text), text)
  assert.equal(pack.evidenceKey, awardEvidenceKey(input, now))
  assert.ok(pack.html.includes("default-src 'none'"))
})
test("all buyer and ERP strings are escaped; document cannot inject scripts or links", () => {
  const input = fixture()
  const payload = '<script>alert("x")</script><img src=x onerror=alert(1)>'
  input.rationale = payload
  input.preparedBy = payload
  input.detail.header.name = payload
  input.detail.replies[0].vendorName = payload
  const { html } = buildAwardPack(input, now)
  assert.ok(!html.includes("<script>"))
  assert.ok(!html.includes("<img "))
  assert.ok(html.includes("&lt;script&gt;"))
})
for (const [label, mutate] of [
  ["acknowledgment", (i) => { i.reviewed = false }],
  ["rationale", (i) => { i.rationale = " " }],
  ["preparer", (i) => { i.preparedBy = "" }],
  ["unselected preference", (i) => { i.preferredId = "missing" }],
  ["duplicate selection", (i) => { i.selectedIds.push("r0") }],
  ["decided reply", (i) => { i.detail.replies[0].status = "Accepted" }],
  ["closed case", (i) => { i.detail.header.status = "Accepted" }],
  ["expired offer", (i) => { i.detail.replies[0].validUntil = "2026-10-20" }],
  ["quantity mismatch", (i) => { i.detail.replies[0].lines[0].quantity = 24 }],
  ["item mismatch", (i) => { i.detail.replies[0].lines[0].itemNumber = "other" }],
  ["duplicate line", (i) => { i.detail.replies[0].lines.push({ ...i.detail.replies[0].lines[0] }) }],
  ["mixed currency", (i) => { i.detail.replies[0].currency = "EUR" }],
  ["partial quote", (i) => { i.detail.replies[0].lines = [] }],
]) test(`blocks pack for ${label}`, () => { const input = fixture(); mutate(input); assert.throws(() => buildAwardPack(input, now)) })
test("source changes, criteria, date, preferred vendor and buyer rationale invalidate evidence key", () => {
  const key = awardEvidenceKey(fixture(), now)
  for (const mutate of [
    (i) => { i.detail.header.company = "demf" },
    (i) => { i.detail.replies[0].lines[0].netAmount += 1 },
    (i) => { i.weights.price = 70 },
    (i) => { i.rationale = "Changed" },
    (i) => { i.preferredId = "r0" },
    (i) => { i.reviewed = false },
  ]) { const input = fixture(); mutate(input); assert.notEqual(awardEvidenceKey(input, now), key) }
  assert.notEqual(awardEvidenceKey(fixture(), new Date("2026-10-22T09:00:00Z")), key)
})
test("ties are identified without implying unique top score", () => {
  const input = fixture()
  input.detail.replies[1].lines[0] = { ...input.detail.replies[0].lines[0], rfqId: "r1" }
  assert.ok(buildAwardPack(input, now).html.includes("tie; display rank does not break the tie"))
})
test("only selected offers are included", () => {
  const input = fixture()
  input.detail.replies.push({ ...input.detail.replies[0], rfqId: "unselected", vendorName: "EXCLUDED VENDOR" })
  assert.ok(!buildAwardPack(input, now).html.includes("EXCLUDED VENDOR"))
})
