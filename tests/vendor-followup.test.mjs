import assert from "node:assert/strict"
import path from "node:path"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { "@": path.resolve("src") } }, logLevel: "error" })
after(() => server.close())
const { followupCandidates, followupDays, defaultFollowupDraft, followupHtml, followupPrompt, validateFollowupDraft, validFollowupEmail } = await server.ssrLoadModule(path.resolve("src", "lib", "vendor-followup.ts"))
const { FollowupJournal, followupBlock, scanFollowups, draftFollowup, sendApprovedFollowup } = await server.ssrLoadModule(path.resolve("src", "data", "vendor-followup.ts"))
const { OutlookEmailService } = await server.ssrLoadModule(path.resolve("src", "data", "dataverse", "outlook-email.ts"))
const vendors = [{ accountNumber: "1001", name: "Acme", email: "buyer@example.com" }]
function detail(id = "000432", deadline = new Date().toISOString().slice(0, 10)) {
  return { header: { rfqCaseId: id, name: "Laptops", company: "usmf", status: "Sent", expiryDate: deadline }, lines: [], replies: [{ rfqId: `${id}-1`, rfqCaseId: id, vendorAccount: "1001", vendorName: "Acme", status: "Sent", notes: "PRIVATE", totalAmount: 30000 }] }
}
function setup() {
  let stored = null
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value } }
  const journal = new FollowupJournal(storage)
  let source = detail(), directory = vendors, calls = []
  const ctx = { repository: { getRfqCase: async () => source, listVendors: async () => directory }, email: { channel: "outlook", send: async (message) => { calls.push(message) } } }
  let tail = Promise.resolve()
  const locks = { request: (_name, _options, action) => { const run = tail.then(action); tail = run.catch(() => {}); return run } }
  const candidate = followupCandidates(source, vendors, "usmf")[0]
  return { journal, storage, ctx, locks, candidate, calls, source, setDirectory: (value) => { directory = value }, send: (approved = true) => sendApprovedFollowup(ctx, candidate, defaultFollowupDraft(candidate), approved, journal, locks) }
}
test("eligibility uses local calendar days, open cases and Sent vendor RFQs only", () => {
  const source = detail("1", "2026-10-28")
  const now = new Date(2026, 9, 21, 23, 59)
  assert.equal(followupDays(source.header, now), 7)
  assert.equal(followupCandidates(source, vendors, "USMF", now).length, 1)
  source.header.expiryDate = "2026-10-29"
  assert.equal(followupCandidates(source, vendors, "usmf", now).length, 0)
  source.header.expiryDate = "2026-10-20"
  assert.equal(followupCandidates(source, vendors, "usmf", now)[0].daysRemaining, -1)
  for (const status of ["Created", "Received", "Accepted", "Rejected", "Declined", "Canceled", "Removed"]) {
    source.replies[0].status = status
    assert.equal(followupCandidates(source, vendors, "usmf", now).length, 0)
  }
  source.replies[0].status = "Sent"
  for (const status of ["Accepted", "Rejected", "Canceled", "Declined", "Removed"]) {
    source.header.status = status
    assert.equal(followupCandidates(source, vendors, "usmf", now).length, 0)
  }
})
test("missing or invalid deadlines are unknown, not overdue", () => {
  for (const expiryDate of [undefined, "", "invalid", "1900-01-01", "2026-02-30"]) assert.equal(followupDays({ ...detail().header, expiryDate }), undefined)
})
test("company, case and duplicate identities fail explicitly", () => {
  assert.throws(() => followupCandidates(detail(), vendors, "demf"), /legal entity/)
  const source = detail()
  source.replies[0].rfqCaseId = "wrong"
  assert.throws(() => followupCandidates(source, vendors, "usmf"), /does not match/)
  source.replies[0].rfqCaseId = source.header.rfqCaseId
  source.replies.push(source.replies[0])
  assert.throws(() => followupCandidates(source, vendors, "usmf"), /Duplicate/)
})
test("recipient requires a unique vendor directory match and one valid address", () => {
  assert.equal(followupCandidates(detail(), [], "usmf")[0].email, "")
  assert.equal(followupCandidates(detail(), [...vendors, ...vendors], "usmf")[0].email, "")
  for (const email of ["", "A <a@example.com>", "a@example.com;b@example.com", "a@example.com\r\nBcc:x@example.com"]) assert.equal(validFollowupEmail(email), false)
  assert.equal(validFollowupEmail("a+rfq@example.com"), true)
})
test("AI prompt allowlists facts and omits addresses, prices, notes and competitors", () => {
  const candidate = setup().candidate
  const prompt = followupPrompt(candidate)
  assert.ok(!prompt.includes(candidate.email))
  assert.ok(!prompt.includes("30000"))
  assert.ok(!prompt.includes("PRIVATE"))
  assert.ok(prompt.includes(candidate.rfqId))
  assert.ok(prompt.includes("Never extend deadlines"))
})
test("standard overdue draft does not extend deadlines; preview escapes HTML", () => {
  const candidate = followupCandidates(detail("1", "2026-10-20"), vendors, "usmf", new Date(2026, 9, 21))[0]
  assert.match(defaultFollowupDraft(candidate).message, /does not extend the deadline/)
  const html = followupHtml('<img src=x onerror="alert(1)"> & text')
  assert.ok(!html.includes("<img"))
  assert.match(html, /&lt;img/)
  assert.match(html, /&amp;/)
})
test("bounded draft parsing rejects invalid content and subject header injection", () => {
  for (const input of [null, {}, { subject: "", message: "x" }, { subject: "a\r\nBcc:bad", message: "x" }, { subject: "x".repeat(201), message: "x" }, { subject: "x", message: "x".repeat(4001) }]) assert.throws(() => validateFollowupDraft(input))
  assert.deepEqual(validateFollowupDraft({ subject: " subject ", message: " body " }), { subject: "subject", message: "body" })
})
test("agent invocation targets dedicated drafting agent and validates output", async () => {
  const candidate = setup().candidate
  const draft = defaultFollowupDraft(candidate)
  const actual = await draftFollowup(candidate, async (agent, body) => {
    assert.equal(agent, "rfq_vendorFollowup")
    assert.ok(!body.message.includes(candidate.email))
    return { success: true, data: { completed: false, responses: [JSON.stringify(draft)] } }
  })
  assert.deepEqual(actual, draft)
  await assert.rejects(draftFollowup(candidate, async () => ({ success: true, data: { responses: ["not JSON"] } })), /valid draft JSON/)
  await assert.rejects(draftFollowup(candidate, async () => ({ success: false, error: new Error("Denied") })), /Denied/)
})
test("scan scopes all reads, bounds concurrency and reports partial coverage", async () => {
  let active = 0, maximum = 0
  const repository = {
    listRfqCases: async (company) => { assert.equal(company, "usmf"); return Array.from({ length: 9 }, (_, i) => detail(String(i)).header) },
    listVendors: async (company) => { assert.equal(company, "usmf"); return vendors },
    getRfqCase: async (id, company) => { assert.equal(company, "usmf"); active++; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 3)); active--; if (id === "0") throw new Error("Denied"); return detail(id) },
  }
  const result = await scanFollowups(repository, "usmf")
  assert.equal(maximum, 4)
  assert.equal(result.checked, 8)
  assert.equal(result.total, 9)
  assert.equal(result.errors[0].caseId, "0")
  assert.equal(result.candidates.length, 8)
})
test("scan rejects cross-company and aborted reads; reports missing deadlines", async () => {
  const repository = { listRfqCases: async () => [{ ...detail().header, expiryDate: undefined }], listVendors: async () => vendors }
  assert.equal((await scanFollowups(repository, "usmf")).unknownDeadlines, 1)
  await assert.rejects(scanFollowups(repository, "demf"), /another company/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(scanFollowups(repository, "usmf", controller.signal))
})
test("send requires explicit approval, live Outlook and cross-tab locking", async () => {
  const s = setup()
  await assert.rejects(s.send(false), /approve/)
  s.ctx.email.channel = "simulated"
  await assert.rejects(s.send(), /live Outlook/)
  s.ctx.email.channel = "outlook"
  await assert.rejects(sendApprovedFollowup(s.ctx, s.candidate, defaultFollowupDraft(s.candidate), true, s.journal, null), /cross-tab/)
  assert.equal(s.calls.length, 0)
})
test("send persists pending BEFORE connector call, escapes HTML and records Outlook acceptance", async () => {
  const s = setup()
  s.ctx.email.send = async (message) => {
    assert.equal(s.journal.list()[0].status, "pending")
    assert.equal(message.to, vendors[0].email)
    assert.ok(!message.html.includes("<script>"))
    s.calls.push(message)
  }
  await sendApprovedFollowup(s.ctx, s.candidate, { subject: "Reminder", message: "<script>not HTML</script>" }, true, s.journal, s.locks)
  assert.equal(s.calls.length, 1)
  assert.equal(s.journal.list()[0].status, "sent")
  await assert.rejects(s.send(), /24-hour/)
})
test("rechecking blocks received replies, closed cases, changed deadlines, recipients and case identity", async () => {
  for (const change of [
    (s) => { s.source.replies[0].status = "Received" },
    (s) => { s.source.header.status = "Accepted" },
    (s) => { s.source.header.expiryDate = "2099-01-01" },
    (s) => { s.setDirectory([{ ...vendors[0], email: "new@example.com" }]) },
    (s) => { s.source.header.rfqCaseId = "other" },
    (s) => { s.source.header.company = "demf" },
  ]) {
    const s = setup(); change(s)
    await assert.rejects(s.send())
    assert.equal(s.calls.length, 0)
    assert.equal(s.journal.list().length, 0)
  }
})
test("calendar-day changes invalidate a previously prepared reminder", async () => {
  const s = setup()
  s.candidate.sourceKey = s.candidate.sourceKey.replace('"daysRemaining":0', '"daysRemaining":1')
  await assert.rejects(s.send(), /changed/)
})
test("storage failure or corrupt history blocks delivery before connector invocation", async () => {
  const s = setup()
  s.storage.setItem = () => { throw new Error("Quota") }
  await assert.rejects(s.send(), /Quota/)
  assert.equal(s.calls.length, 0)
  const bad = new FollowupJournal({ getItem: () => '[{"status":"sent"}]', setItem: () => {} })
  assert.throws(() => bad.list(), /invalid/)
})
test("connector failure is uncertain and cannot be blindly retried even after 24 hours", async () => {
  const s = setup()
  s.ctx.email.send = async () => { throw new Error("network timeout") }
  await assert.rejects(s.send(), /uncertain/)
  assert.equal(s.journal.list()[0].status, "unknown")
  assert.match(followupBlock(s.candidate, s.journal.list(), new Date(Date.now() + 2 * 86400000)), /uncertain/)
  await assert.rejects(s.send(), /uncertain/)
})
test("failure to finalize accepted email leaves pending guard and explicit error", async () => {
  const s = setup()
  const save = s.journal.save.bind(s.journal)
  s.journal.save = (records) => { if (records[0].status === "sent") throw new Error("Quota"); save(records) }
  await assert.rejects(s.send(), /accepted the email/)
  assert.equal(s.calls.length, 1)
  assert.equal(s.journal.list()[0].status, "pending")
})
test("cross-tab serialization sends only once and cooldown expires exactly at 24 hours", async () => {
  const s = setup()
  const results = await Promise.allSettled([s.send(), s.send()])
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(s.calls.length, 1)
  const attempts = s.journal.list()
  const at = Date.parse(attempts[0].at)
  assert.match(followupBlock(s.candidate, attempts, new Date(at + 86400000 - 1)), /24-hour/)
  assert.equal(followupBlock(s.candidate, attempts, new Date(at + 86400000)), undefined)
  assert.equal(followupBlock({ ...s.candidate, company: "demf" }, attempts), undefined)
})
test("Outlook adapter rejects missing or non-success acknowledgement", async () => {
  for (const response of [undefined, {}, { success: false, error: "Denied" }]) {
    const service = new OutlookEmailService({ SendEmailV2: async () => response })
    await assert.rejects(service.send({ to: "a@example.com", subject: "Reminder", html: "text" }))
  }
  await new OutlookEmailService({ SendEmailV2: async () => ({ success: true }) }).send({ to: "a@example.com", subject: "Reminder", html: "text" })
})
