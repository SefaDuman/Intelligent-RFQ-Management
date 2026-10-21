import assert from "node:assert/strict"
import path from "node:path"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { "@": path.resolve("src") } },
  logLevel: "error",
})
after(() => server.close())
const { evaluateRfqHealth } = await server.ssrLoadModule(path.resolve("src", "lib", "rfq-health.ts"))
const { scanOpenRfqs } = await server.ssrLoadModule(path.resolve("src", "hooks", "use-rfq-health.ts"))
const now = new Date(2026, 9, 21, 12)
function fixture() {
  return {
    header: { recordId: "case", rfqCaseId: "000432", name: "Laptops", status: "Received", company: "usmf", currency: "USD", expiryDate: "2026-11-10" },
    lines: [{ recordId: "line", rfqCaseId: "000432", lineNumber: 1, itemNumber: "1000", quantity: 10, unit: "ea" }],
    replies: [100, 110].map((amount, index) => ({
      recordId: `r${index}`, rfqId: `r${index}`, rfqCaseId: "000432", vendorAccount: `${index}`, vendorName: `Vendor ${index}`, status: "Received",
      currency: "USD", paymentTerms: "Net30", validUntil: "2026-11-30",
      lines: [{ recordId: `l${index}`, rfqId: `r${index}`, lineNumber: 1, itemNumber: "1000", quantity: 10, unitPrice: amount / 10, discountPct: 0, netAmount: amount, quoted: true, leadTimeDays: 10 }],
    })),
  }
}
const findings = (detail) => evaluateRfqHealth(detail, now).findings
const ids = (detail) => findings(detail).map((finding) => finding.id)

test("complete offers with a future deadline produce no findings", () => assert.deepEqual(ids(fixture()), []))
for (const [date, expected, severity] of [
  ["2026-10-29", undefined, undefined],
  ["2026-10-28", "due-soon", "medium"],
  ["2026-10-23", "due-soon", "high"],
  ["2026-10-21", "due-soon", "high"],
  ["2026-10-20", "overdue", "high"],
]) {
  test(`deadline boundary ${date}`, () => {
    const detail = fixture()
    detail.header.expiryDate = date
    assert.deepEqual(findings(detail).map(({ id, severity }) => ({ id, severity })), expected ? [{ id: expected, severity }] : [])
  })
}
test("near-deadline reply and rate thresholds use sent RFQs, exclude drafts/canceled/removed, include declines", () => {
  const detail = fixture()
  detail.header.expiryDate = "2026-10-23"
  detail.replies[1].status = "Sent"
  assert.ok(ids(detail).includes("few-replies"))
  assert.ok(!ids(detail).includes("low-response")) // 1/2 exactly 50%
  for (const status of ["Created", "Canceled", "Removed"]) detail.replies.push({ ...detail.replies[1], status })
  assert.ok(!ids(detail).includes("low-response"))
  detail.replies.push({ ...detail.replies[1], rfqId: "declined", status: "Declined" })
  assert.ok(findings(detail).find((finding) => finding.id === "low-response").evidence.includes("1 of 3"))
  detail.header.expiryDate = "2026-11-10"
  assert.ok(!ids(detail).includes("few-replies"))
  assert.ok(!ids(detail).includes("low-response"))
})
test("no invitations do not fabricate a zero percent response rate", () => {
  const detail = fixture()
  detail.header.expiryDate = "2026-10-21"
  detail.replies = []
  assert.ok(ids(detail).includes("few-replies"))
  assert.ok(!ids(detail).includes("low-response"))
})
test("closed cases are excluded even when overdue", () => {
  for (const status of ["Accepted", "Rejected", "Canceled", "Declined", "Removed"]) {
    const detail = fixture()
    detail.header.status = status
    detail.header.expiryDate = "2020-01-01"
    assert.deepEqual(ids(detail), [])
  }
})
test("missing, invalid and sentinel deadlines are unknown, not overdue", () => {
  for (const date of [undefined, "invalid", "2026-02-30", "1900-01-01T00:00:00Z"]) {
    const detail = fixture()
    detail.header.expiryDate = date
    assert.deepEqual(ids(detail), ["deadline-unknown"])
  }
})
test("wide spread triggers at exactly 20 percent but not below", () => {
  const detail = fixture()
  detail.replies[1].lines[0].netAmount = 119.99
  assert.ok(!ids(detail).includes("price-spread"))
  detail.replies[1].lines[0].netAmount = 120
  const spread = findings(detail).find((finding) => finding.id === "price-spread")
  assert.match(spread.evidence, /20.0%/)
  assert.equal(spread.action, "Compare offers")
})
for (const [label, mutate] of [
  ["mixed currency", (d) => { d.replies[1].currency = "EUR" }],
  ["missing currency", (d) => { d.header.currency = "" }],
  ["partial offer", (d) => { d.replies[1].lines = [] }],
  ["declined line", (d) => { d.replies[1].lines[0].quoted = false }],
  ["quantity mismatch", (d) => { d.replies[1].lines[0].quantity = 9 }],
  ["item mismatch", (d) => { d.replies[1].lines[0].itemNumber = "other" }],
  ["non-finite amount", (d) => { d.replies[1].lines[0].netAmount = NaN }],
  ["zero price", (d) => { d.replies[1].lines[0].unitPrice = 0 }],
  ["expired offer", (d) => { d.replies[1].validUntil = "2026-10-20" }],
  ["duplicate line", (d) => { d.replies[1].lines.push({ ...d.replies[1].lines[0] }) }],
]) {
  test(`${label} prevents misleading price anomaly`, () => {
    const detail = fixture()
    detail.replies[1].lines[0].netAmount = 200
    mutate(detail)
    assert.ok(ids(detail).includes("offer-r1"))
    assert.ok(ids(detail).includes("spread-unavailable"))
    assert.ok(!ids(detail).includes("price-spread"))
  })
}
test("missing validity, payment and delivery terms are explicit; known zero-day lead time is valid", () => {
  const detail = fixture()
  delete detail.replies[0].validUntil
  delete detail.replies[0].paymentTerms
  delete detail.replies[0].lines[0].leadTimeDays
  const issue = findings(detail).find((finding) => finding.id === "offer-r0")
  assert.match(issue.evidence, /validity unavailable/)
  assert.match(issue.evidence, /payment terms unavailable/)
  assert.match(issue.evidence, /no valid lead time/)
  detail.replies[0].lines[0].leadTimeDays = 0
  assert.ok(!findings(detail).find((finding) => finding.id === "offer-r0").evidence.includes("no valid lead time"))
})
test("missing requested lines are not treated as verified coverage", () => {
  const detail = fixture()
  detail.lines = []
  assert.ok(ids(detail).includes("no-lines"))
  assert.ok(ids(detail).includes("spread-unavailable"))
})
test("an offer valid through today is not expired", () => {
  const detail = fixture()
  detail.replies[0].validUntil = "2026-10-21"
  assert.deepEqual(ids(detail), [])
})
test("scan bounds concurrency, excludes closed cases and reports partial failures", async () => {
  let active = 0
  let maxActive = 0
  const calls = []
  const repository = {
    async listRfqCases(company) {
      assert.equal(company, "usmf")
      return Array.from({ length: 10 }, (_, i) => ({ ...fixture().header, rfqCaseId: String(i), status: i === 9 ? "Accepted" : "Received" }))
    },
    async getRfqCase(id, company) {
      calls.push([id, company])
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      if (id === "1") throw new Error("Access denied")
      if (id === "2") return null
      const detail = fixture()
      detail.header.rfqCaseId = id
      if (id === "3") detail.header.company = "demf"
      return detail
    },
  }
  const scan = await scanOpenRfqs(repository, "usmf")
  assert.equal(scan.total, 9)
  assert.equal(scan.details.length, 6)
  assert.equal(scan.errors.length, 3)
  assert.equal(maxActive, 4)
  assert.equal(calls.length, 9)
  assert.ok(calls.every(([, company]) => company === "usmf"))
  assert.ok(scan.errors.some(({ message }) => message === "Access denied"))
  assert.ok(scan.errors.some(({ message }) => message.includes("scope")))
  assert.ok(Number.isFinite(Date.parse(scan.checkedAt)))
})
test("scan surfaces list failure, rejects cross-company lists and honors cancellation", async () => {
  await assert.rejects(scanOpenRfqs({ listRfqCases: async () => { throw new Error("Unavailable") } }, "usmf"), /Unavailable/)
  await assert.rejects(scanOpenRfqs({ listRfqCases: async () => [{ ...fixture().header, company: "demf" }] }, "usmf"), /outside/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(scanOpenRfqs({ listRfqCases: async () => [fixture().header] }, "usmf", controller.signal))
})
