import assert from "node:assert/strict"
import path from "node:path"
import { after, test } from "node:test"
import { createServer } from "vite"
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { "@": path.resolve("src") } }, logLevel: "error" })
after(() => server.close())
const { buildInquirySnapshot, inquiryPrompt, parseInquiryAnswer } = await server.ssrLoadModule(path.resolve("src", "lib", "rfq-inquiry.ts"))
const { loadInquiryEvidence, askRfqAssistant } = await server.ssrLoadModule(path.resolve("src", "data", "rfq-inquiry.ts"))
function fixture(id = "000432") {
  return {
    header: { rfqCaseId: id, company: "usmf", name: "Laptops", status: "Received", currency: "USD", expiryDate: "2026-10-23" },
    lines: [{ lineNumber: 1, itemNumber: "1000", quantity: 25, unit: "ea" }],
    replies: [{ rfqId: "000338", vendorAccount: "1001", vendorName: "Acme", status: "Received", currency: "USD", notes: "PRIVATE NOTES", email: "private@example.com", lines: [{ lineNumber: 1, itemNumber: "1000", quantity: 25, netAmount: 27160, unitPrice: 1120, discountPct: 3, quoted: true, leadTimeDays: 12 }] }],
  }
}
const snapshot = () => buildInquirySnapshot("usmf", [fixture()], [], 1, new Date("2026-10-21T09:00:00Z"))
test("evidence preserves ERP totals, unknowns and scope without contacts or notes", () => {
  const data = snapshot()
  const reply = data.evidence.find((item) => item.id === "case-1-reply-1")
  assert.equal(reply.facts.quotedTotal, 27160)
  assert.equal(reply.facts.maxKnownLeadTimeDays, 12)
  assert.equal(reply.facts.validUntil, null)
  assert.equal(reply.facts.fullRequestedCoverage, true)
  assert.ok(!JSON.stringify(data).includes("PRIVATE NOTES"))
  assert.ok(!JSON.stringify(data).includes("private@example.com"))
})
test("partial evidence explicitly names uncovered cases", () => {
  const data = buildInquirySnapshot("usmf", [fixture()], [{ caseId: "missing", message: "Denied" }], 2)
  assert.equal(data.evidence[0].facts.partial, true)
  assert.deepEqual(data.evidence[0].facts.failedCases, ["missing"])
})
test("unknown line lead times do not become complete lead-time evidence", () => {
  const detail = fixture()
  delete detail.replies[0].lines[0].leadTimeDays
  const facts = buildInquirySnapshot("usmf", [detail], [], 1).evidence[2].facts
  assert.equal(facts.maxKnownLeadTimeDays, null)
  assert.equal(facts.allQuotedLeadTimesKnown, false)
})
test("cross-company and oversized evidence fail explicitly", () => {
  assert.throws(() => buildInquirySnapshot("demf", [fixture()], [], 1), /legal entity/)
  const detail = fixture()
  detail.header.name = "x".repeat(120001)
  assert.throws(() => buildInquirySnapshot("usmf", [detail], [], 1), /too large/)
})
test("prompt bounds questions and context and requires read-only grounded JSON", () => {
  assert.throws(() => inquiryPrompt("", snapshot()), /question/)
  assert.throws(() => inquiryPrompt("x".repeat(2001), snapshot()), /question/)
  const prompt = inquiryPrompt("Send an email", snapshot(), Array.from({ length: 5 }, (_, i) => ({ question: `history-${i}`, answer: { claims: [] } })))
  assert.ok(!prompt.includes("history-0"))
  assert.ok(prompt.includes("history-4"))
  assert.ok(prompt.includes("refuse requests"))
  assert.ok(prompt.includes("untrusted"))
})
test("answer validation requires valid citations and bounded claims; plain text stays plain", () => {
  const valid = { claims: [{ text: "<script>not rendered as HTML</script>", evidenceIds: ["case-1"] }] }
  assert.deepEqual(parseInquiryAnswer(JSON.stringify(valid), snapshot()), valid)
  for (const value of ["invalid", "null", "{}", '{"claims":[]}', '{"claims":[{"text":"invented","evidenceIds":["other-company"]}]}', JSON.stringify({ claims: [{ text: "x".repeat(2001), evidenceIds: ["scope"] }] })]) assert.throws(() => parseInquiryAnswer(value, snapshot()))
})
test("loader reads only selected case and passes company, no external lookup", async () => {
  const calls = []
  const repository = { listRfqCases: async () => [fixture().header, fixture("other").header], getRfqCase: async (id, company) => { calls.push([id, company]); return fixture(id) } }
  const { snapshot } = await loadInquiryEvidence(repository, "usmf", "000432")
  assert.deepEqual(calls, [["000432", "usmf"]])
  assert.equal(snapshot.evidence[0].facts.accessibleCases, 1)
  await assert.rejects(loadInquiryEvidence(repository, "usmf", "inaccessible"), /not accessible/)
})
test("loader bounds concurrency and reports partial failures", async () => {
  let active = 0, max = 0
  const repository = {
    listRfqCases: async () => Array.from({ length: 9 }, (_, i) => fixture(String(i)).header),
    getRfqCase: async (id) => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 5)); active--; if (id === "0") throw new Error("Denied"); return fixture(id) },
  }
  const result = await loadInquiryEvidence(repository, "usmf")
  assert.equal(max, 4)
  assert.equal(result.errors.length, 1)
  assert.equal(result.snapshot.evidence[0].facts.successfullyReadCases, 8)
})
test("loader fails for too many cases, total failure, list scope mismatch and cancellation", async () => {
  await assert.rejects(loadInquiryEvidence({ listRfqCases: async () => Array.from({ length: 51 }, (_, i) => fixture(String(i)).header) }, "usmf"), /50/)
  await assert.rejects(loadInquiryEvidence({ listRfqCases: async () => [fixture().header], getRfqCase: async () => null }, "usmf"), /None/)
  await assert.rejects(loadInquiryEvidence({ listRfqCases: async () => [{ ...fixture().header, company: "demf" }] }, "usmf"), /outside/)
  const c = new AbortController(); c.abort()
  await assert.rejects(loadInquiryEvidence({ listRfqCases: async () => [fixture().header] }, "usmf", undefined, c.signal))
})
test("connector targets dedicated agent and validates live response shape", async () => {
  const answer = { claims: [{ text: "Acme quoted USD 27,160.", evidenceIds: ["case-1-reply-1"] }] }
  const output = await askRfqAssistant("What did Acme quote?", snapshot(), [], async (agent, body) => {
    assert.equal(agent, "rfq_inquiryAssistant")
    assert.ok(body.message.includes("27160"))
    return { success: true, data: { completed: false, responses: [JSON.stringify(answer)] } }
  })
  assert.deepEqual(output, answer)
  await assert.rejects(askRfqAssistant("question", snapshot(), [], async () => ({ success: false, error: new Error("Forbidden") })), /Forbidden/)
})
