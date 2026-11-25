import assert from "node:assert/strict"
import path from "node:path"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { "@": path.resolve("src") } }, logLevel: "error" })
after(() => server.close())
const load = (name) => server.ssrLoadModule(path.resolve("src", "lib", "sourcing", `${name}.ts`))
const { rankSuppliers, recommendShortlist } = await load("supplier-shortlist")
const { parseRequirement, validateDraft, newDraft, buildDraftPackage, parseNumber, extractDates, DRAFT_PACKAGE_NOTICE } = await load("rfq-draft")
const { newEvaluation, setScore, technicalResults, combineScores, DEFAULT_CRITERIA } = await load("evaluation")
const { optimizeAward, consolidationCurve } = await load("scenarios")
const { buildTargets, suggestTarget, measureRound, roundSavings, buildRequestEmail, newRound } = await load("negotiation")
const { clarificationStatus, newClarification, buildPublishEmail, summarizeClarifications } = await load("clarifications")
const { deriveAwardedSavings, summarizeSavings } = await load("savings")
const { LocalCollection } = await server.ssrLoadModule(path.resolve("src", "data", "sourcing-store.ts"))

const TODAY = new Date(2026, 10, 25)

/* ---------- Supplier shortlist ---------- */
test("shortlist favours category fit, performance and bidding history", () => {
  const vendors = [
    { accountNumber: "A", name: "Alpha IT", email: "a@x.com", vendorGroup: "IT hardware", rating: 4.5, onTimeDeliveryPct: 95 },
    { accountNumber: "B", name: "Beta Office", email: "b@x.com", vendorGroup: "Office", rating: 4.8, onTimeDeliveryPct: 98 },
    { accountNumber: "C", name: "Gamma IT", vendorGroup: "IT hardware", rating: 2.5, onTimeDeliveryPct: 70 },
  ]
  const cases = [{ rfqCaseId: "1", procurementCategory: "IT hardware" }]
  const replies = [
    { rfqId: "1-A", rfqCaseId: "1", vendorAccount: "A", status: "Received" },
    { rfqId: "1-C", rfqCaseId: "1", vendorAccount: "C", status: "Declined" },
  ]
  const ranked = rankSuppliers({ vendors, cases, replies, category: "it hardware" })
  assert.deepEqual(ranked.map((r) => r.vendor.accountNumber), ["A", "C", "B"])
  assert.ok(ranked[0].reasons.some((r) => /Vendor group matches/.test(r)))
  assert.ok(ranked.find((r) => r.vendor.accountNumber === "C").warnings.some((w) => /Low rating/.test(w)))
  assert.ok(ranked.find((r) => r.vendor.accountNumber === "C").warnings.some((w) => /e-mail/.test(w)))
  assert.deepEqual(recommendShortlist(ranked, 5, 0).map((r) => r.vendor.accountNumber), ["A"], "vendors without e-mail or any category evidence are not recommended")
})

test("shortlist ignores un-issued vendor RFQs when measuring responsiveness", () => {
  const vendors = [{ accountNumber: "A", name: "Alpha", email: "a@x.com" }]
  const replies = [{ rfqId: "1-A", rfqCaseId: "1", vendorAccount: "A", status: "Created" }]
  const [ranked] = rankSuppliers({ vendors, cases: [], replies })
  assert.equal(ranked.components.responsiveness, 50)
})

/* ---------- RFQ drafting ---------- */
test("parseNumber handles thousands and decimal separators", () => {
  assert.equal(parseNumber("1,200.50"), 1200.5)
  assert.equal(parseNumber("1.200,50"), 1200.5)
  assert.equal(parseNumber("1,200"), 1200)
  assert.equal(parseNumber("12,5"), 12.5)
  assert.equal(parseNumber("20"), 20)
})

test("extractDates separates reply and delivery dates and rolls past dates into next year", () => {
  const r = extractDates("Deliver by 15 December. Quotes due by 2026-12-01", TODAY)
  assert.equal(r.requestedDeliveryDate, "2026-12-15")
  assert.equal(r.replyByDate, "2026-12-01")
  assert.equal(extractDates("by March", TODAY).requestedDeliveryDate, "2027-03-31")
  assert.equal(extractDates("within 2 weeks", TODAY).requestedDeliveryDate, "2026-12-09")
  assert.equal(extractDates("by 31 February", TODAY).requestedDeliveryDate, undefined)
})

test("parseRequirement reads multi-line item lists with prices, units and dates", () => {
  const text = ["Laptops for new hires", "- 20 x Dell Latitude 7450 @ €1,250", "- Docking station - 20 pcs", "- 3 licenses of Figma", "Deliver by 15 December", "Croatia office onboarding"].join("\n")
  const parsed = parseRequirement(text, { today: TODAY, categories: ["IT hardware", "Facilities"], defaultCurrency: "USD" })
  assert.equal(parsed.title, "Laptops for new hires")
  assert.equal(parsed.currency, "EUR")
  assert.deepEqual(parsed.lines.map((l) => [l.itemName, l.quantity, l.unit, l.targetUnitPrice]), [
    ["Dell Latitude 7450", 20, "pcs", 1250],
    ["Docking station", 20, "pcs", undefined],
    ["Figma", 3, "licenses", undefined],
  ])
  assert.equal(parsed.requestedDeliveryDate, "2026-12-15")
  assert.match(parsed.justification, /Croatia office onboarding/)
  assert.doesNotMatch(parsed.justification, /Deliver/)
  assert.ok(parsed.warnings.some((w) => /category/.test(w)))
})

test("parseRequirement extracts a single sentence and does not mistake dates or years for items", () => {
  const parsed = parseRequirement("I need 20 laptops for new hires in Croatia by 15 December", { today: TODAY })
  assert.deepEqual(parsed.lines.map((l) => [l.itemName, l.quantity]), [["laptops", 20]])
  assert.equal(parsed.requestedDeliveryDate, "2026-12-15")
  assert.equal(parseRequirement("2026 Office refresh\n10 chairs", { today: TODAY }).lines.length, 1)
  const empty = parseRequirement("Something vague", { today: TODAY })
  assert.equal(empty.lines.length, 0)
  assert.ok(empty.warnings.some((w) => /No line items/.test(w)))
})

test("validateDraft blocks incomplete events and warns on weak ones", () => {
  const draft = newDraft("usmf", "USD", undefined, TODAY)
  const fields = (issues, level) => issues.filter((i) => i.level === level).map((i) => i.field)
  assert.deepEqual(fields(validateDraft(draft, TODAY), "error").sort(), ["lines", "title"])
  const ready = { ...draft, title: "Laptops", category: "IT", lines: [{ id: "l", itemName: "Laptop", quantity: 2, unit: "pcs" }], requestedDeliveryDate: "2027-01-10", shortlist: [{ accountNumber: "A", name: "A", email: "a@x.com" }] }
  const issues = validateDraft(ready, TODAY)
  assert.equal(fields(issues, "error").length, 0)
  assert.ok(issues.some((i) => i.field === "shortlist" && /three/.test(i.message)))
  assert.ok(validateDraft({ ...ready, replyByDate: "2026-11-01" }, TODAY).some((i) => i.level === "error" && i.field === "replyByDate"))
  assert.ok(validateDraft({ ...ready, criteria: [{ id: "a", label: "A", weight: 60 }] }, TODAY).some((i) => i.field === "criteria"))
})

test("draft package is clearly a staging artifact", () => {
  const pkg = buildDraftPackage({ ...newDraft("usmf", "EUR", undefined, TODAY), title: " Laptops ", lines: [{ id: "l", itemName: "Laptop", quantity: 2, unit: "pcs", targetUnitPrice: 900 }] }, TODAY)
  assert.equal(pkg.notice, DRAFT_PACKAGE_NOTICE)
  assert.equal(pkg.event.title, "Laptops")
  assert.deepEqual(pkg.lines[0], { lineNumber: 1, itemName: "Laptop", quantity: 2, unit: "pcs", targetUnitPrice: 900 })
})

/* ---------- Evaluation ---------- */
test("technical scoring averages evaluators, weights criteria and gates must-pass criteria", () => {
  let record = newEvaluation("usmf", "1", [
    { id: "fit", label: "Fit", weight: 60, mustPass: true },
    { id: "support", label: "Support", weight: 40 },
  ])
  record = setScore(record, "Ann", "1-A", "fit", 5)
  record = setScore(record, "Bob", "1-A", "fit", 3)
  record = setScore(record, "Ann", "1-A", "support", 5)
  record = setScore(record, "Ann", "1-B", "fit", 2)
  record = setScore(record, "Ann", "1-B", "support", 5)
  const [a, b] = technicalResults(record, ["1-A", "1-B"])
  assert.equal(a.criterionAverages.fit, 4)
  assert.equal(a.evaluators, 2)
  assert.ok(Math.abs(a.score - (0.8 * 60 + 1.0 * 40) / 100 * 100) < 1e-9)
  assert.deepEqual(b.failedMustPass, ["Fit"])

  record = { ...record, technicalWeightPct: 50 }
  const combined = combineScores(record, [
    { rfqId: "1-A", vendorName: "A", commercial: 80 },
    { rfqId: "1-B", vendorName: "B", commercial: 100 },
    { rfqId: "1-C", vendorName: "C", commercial: 90 },
  ])
  assert.equal(combined[0].rank, 1)
  assert.equal(combined[1].disqualified, true)
  assert.equal(combined[1].rank, undefined)
  assert.equal(combined[2].combined, undefined, "unscored bids are not ranked")
  assert.equal(setScore(record, "Ann", "1-A", "fit", 9).scores.Ann["1-A"].fit, 5, "scores are clamped")
  assert.equal(setScore(record, "Ann", "1-A", "fit", undefined).scores.Ann["1-A"].fit, undefined)
  assert.equal(DEFAULT_CRITERIA.reduce((s, c) => s + c.weight, 0), 100)
})

/* ---------- Award scenarios ---------- */
const lines = [1, 2, 3].map((n) => ({ lineNumber: n, itemNumber: `I${n}`, itemName: `Item ${n}`, quantity: 1, unit: "pcs" }))
const reply = (id, amounts, lead = 10, quoted = []) => ({
  rfqId: id, vendorName: id, rfqCaseId: "1", vendorAccount: id, status: "Received",
  lines: amounts.map((a, i) => ({ lineNumber: i + 1, unitPrice: a ?? 0, quantity: 1, discountPct: 0, netAmount: a ?? 0, quoted: a !== undefined && !quoted.includes(i + 1), leadTimeDays: Array.isArray(lead) ? lead[i] : lead })),
})
const offers = [reply("A", [10, 50, 30]), reply("B", [20, 20, 20]), reply("C", [15, 40, undefined])]

test("optimizer finds the cheapest split, single-vendor and capped awards", () => {
  const free = optimizeAward(lines, offers)
  assert.equal(free.total, 10 + 20 + 20)
  assert.equal(free.vendorsUsed, 2)
  const single = optimizeAward(lines, offers, { requiredRfqIds: [], excludedRfqIds: [], maxVendors: 1 })
  assert.equal(single.total, 60)
  assert.equal(single.shares[0].vendorName, "B")
  const capped = optimizeAward(lines, offers, { requiredRfqIds: [], excludedRfqIds: [], maxSharePct: 60 })
  assert.ok(capped.feasible && capped.shares.every((s) => s.sharePct <= 60.0001))
  assert.ok(capped.total >= free.total)
})

test("optimizer honours required, excluded, minimum share and lead-time constraints", () => {
  const required = optimizeAward(lines, offers, { requiredRfqIds: ["A"], excludedRfqIds: [] })
  assert.ok(required.shares.some((s) => s.rfqId === "A"))
  const excluded = optimizeAward(lines, offers, { requiredRfqIds: [], excludedRfqIds: ["A", "C"] })
  assert.equal(excluded.total, 60)
  const minShare = optimizeAward(lines, offers, { requiredRfqIds: [], excludedRfqIds: [], minSharePct: 40 })
  assert.ok(minShare.feasible && minShare.shares.every((s) => s.sharePct >= 40 - 1e-6))
  const slow = [reply("A", [10, 10, 10], 30), reply("B", [20, 20, 20], 5)]
  assert.equal(optimizeAward(lines, slow, { requiredRfqIds: [], excludedRfqIds: [], maxLeadTimeDays: 10 }).total, 60)
  const unknownLead = [reply("A", [10, 10, 10], [undefined, undefined, undefined])]
  const blocked = optimizeAward(lines, unknownLead, { requiredRfqIds: [], excludedRfqIds: [], maxLeadTimeDays: 10 })
  assert.equal(blocked.feasible, false)
  assert.match(blocked.reason, /lead-time/)
})

test("optimizer reports infeasible constraints instead of guessing", () => {
  const result = optimizeAward(lines, offers, { requiredRfqIds: [], excludedRfqIds: [], maxSharePct: 30 })
  assert.equal(result.feasible, false)
  assert.ok(result.reason)
  assert.equal(optimizeAward(lines, [], undefined).feasible, false)
  const partialOnly = optimizeAward(lines, [offers[2]])
  assert.equal(partialOnly.feasible, false, "an offer that skips a line cannot cover the RFQ alone")
})

test("consolidation curve shows the cost of fewer vendors", () => {
  const curve = consolidationCurve(lines, offers)
  assert.equal(curve[0].result.total, 60)
  assert.equal(curve[0].premium, 10)
  assert.equal(curve.at(-1).premium, 0)
})

/* ---------- Negotiation ---------- */
test("round targets follow the strategy and never ask the lowest bidder to match itself", () => {
  assert.equal(suggestTarget(120, 100, "match-lowest", 5), 100)
  assert.equal(suggestTarget(120, 100, "half-gap", 5), 110)
  assert.equal(suggestTarget(120, 100, "percent", 5), 114)
  assert.equal(suggestTarget(100, 100, "half-gap", 5), undefined)
  const targets = buildTargets([
    { rfqId: "A", vendorAccount: "A", vendorName: "A", total: 100 },
    { rfqId: "B", vendorAccount: "B", vendorName: "B", total: 120 },
    { rfqId: "C", vendorAccount: "C", vendorName: "C", total: 200 },
  ], "half-gap", 5)
  assert.deepEqual(targets.map((t) => t.included), [true, true, false])
  assert.equal(targets[1].targetTotal, 110)
})

test("round measurement compares live totals to the snapshot", () => {
  const round = newRound("usmf", "1", 1, [
    { rfqId: "A", vendorAccount: "A", vendorName: "A", total: 100 },
    { rfqId: "B", vendorAccount: "B", vendorName: "B", total: 120 },
    { rfqId: "C", vendorAccount: "C", vendorName: "C", total: 110 },
  ])
  const moves = measureRound(round, { A: 100, B: 108, C: 115 })
  assert.deepEqual(moves.map((m) => m.status), ["unchanged", "improved", "worse"])
  assert.equal(moves[1].metTarget, true)
  const savings = roundSavings(moves)
  assert.equal(savings.amount, 12)
  assert.equal(savings.improvedVendors, 1)
})

test("best-and-final-offer e-mail discloses only the recipient's own figures", () => {
  const email = buildRequestEmail({ caseId: "1", caseName: "Laptops", vendorName: "B", roundNumber: 2, replyBy: "2026-12-05", currency: "EUR", ownTotal: 12000, targetTotal: 11000, senderName: "Sam" })
  assert.match(email.message, /12,000\.00 EUR/)
  assert.match(email.message, /11,000\.00 EUR or better/)
  assert.doesNotMatch(email.message, /lowest|competitor|other (bid|supplier)/i)
  assert.match(buildRequestEmail({ caseId: "1", caseName: "L", vendorName: "B", roundNumber: 1, currency: "EUR", ownTotal: 1, senderName: "S" }).message, /best and final offer/)
})

/* ---------- Clarifications ---------- */
test("clarification lifecycle and anonymised broadcast", () => {
  const c = newClarification("usmf", "1", "vendor", "  Is warranty included?  ", { account: "B", name: "Beta Corp" })
  assert.equal(c.question, "Is warranty included?")
  assert.equal(clarificationStatus(c), "open")
  const answered = { ...c, answer: "Yes, 3 years." }
  assert.equal(clarificationStatus(answered), "answered")
  assert.equal(clarificationStatus({ ...answered, publishedAt: "2026-11-25T00:00:00Z" }), "published")
  assert.deepEqual(summarizeClarifications([c, answered]), { total: 2, open: 1, answered: 1, published: 0 })
  const email = buildPublishEmail({ caseId: "1", caseName: "Laptops", question: c.question, answer: answered.answer, senderName: "Sam" })
  assert.doesNotMatch(email.message, /Beta/)
  assert.match(email.message, /Answer: Yes, 3 years\./)
})

/* ---------- Savings ---------- */
const detail = (over = {}) => ({
  header: { rfqCaseId: "1", name: "Laptops", currency: "EUR", procurementCategory: "IT", status: "Accepted", company: "usmf" },
  lines: [{ lineNumber: 1, quantity: 10, targetUnitPrice: 120 }, { lineNumber: 2, quantity: 5, targetUnitPrice: 100 }],
  replies: [
    { rfqId: "1-A", vendorName: "A", status: "Accepted", totalAmount: 1500, lines: [{ lineNumber: 1, quoted: true, unitPrice: 100, netAmount: 1000 }, { lineNumber: 2, quoted: true, unitPrice: 100, netAmount: 500 }] },
    { rfqId: "1-B", vendorName: "B", status: "Rejected", totalAmount: 1800, lines: [{ lineNumber: 1, quoted: true, unitPrice: 120, netAmount: 1200 }, { lineNumber: 2, quoted: true, unitPrice: 120, netAmount: 600 }] },
  ],
  ...over,
})

test("awarded savings use the target price, falling back to the average comparable bid", () => {
  const withTarget = deriveAwardedSavings([detail()])
  assert.equal(withTarget.savings[0].basis, "target")
  assert.equal(withTarget.savings[0].baseline, 1700)
  assert.equal(withTarget.savings[0].savings, 200)
  const noTarget = detail({ lines: [{ lineNumber: 1, quantity: 10 }, { lineNumber: 2, quantity: 5 }] })
  const avg = deriveAwardedSavings([noTarget]).savings[0]
  assert.equal(avg.basis, "average-bid")
  assert.equal(avg.baseline, 1650)
})

test("savings are skipped when the award is partial or has no baseline", () => {
  const partial = detail({ replies: [{ rfqId: "1-A", vendorName: "A", status: "Accepted", totalAmount: 1000, lines: [{ lineNumber: 1, quoted: true, unitPrice: 100, netAmount: 1000 }] }] })
  const out = deriveAwardedSavings([partial])
  assert.equal(out.savings.length, 0)
  assert.match(out.skipped[0].reason, /every RFQ line/)
  const lone = detail({ lines: [{ lineNumber: 1, quantity: 10 }, { lineNumber: 2, quantity: 5 }], replies: [detail().replies[0]] })
  assert.match(deriveAwardedSavings([lone]).skipped[0].reason, /fewer than two/)
  assert.equal(deriveAwardedSavings([detail({ replies: [] })]).skipped.length, 0, "RFQs without an award are not reported")
})

test("savings summary groups by currency and category and ignores identified initiatives", () => {
  const { savings } = deriveAwardedSavings([detail()])
  const totals = summarizeSavings(savings, [
    { id: "1", company: "usmf", updatedAt: "", title: "Renegotiate", category: "IT", currency: "EUR", baseline: 1000, negotiated: 900, status: "realized" },
    { id: "2", company: "usmf", updatedAt: "", title: "Idea", currency: "EUR", baseline: 5000, negotiated: 1000, status: "identified" },
    { id: "3", company: "usmf", updatedAt: "", title: "US deal", currency: "USD", baseline: 100, negotiated: 90, status: "negotiated" },
  ])
  assert.equal(totals.length, 2)
  const eur = totals.find((t) => t.currency === "EUR")
  assert.equal(eur.savings, 300)
  assert.equal(eur.awardedSavings, 200)
  assert.equal(eur.initiativeSavings, 100)
  assert.equal(eur.byCategory[0].category, "IT")
})

/* ---------- Local store ---------- */
test("local collection scopes by company, upserts, removes and tolerates corrupt storage", () => {
  let raw = null
  const storage = { getItem: () => raw, setItem: (_k, v) => { raw = v } }
  const store = new LocalCollection("test", storage)
  assert.deepEqual(store.list("usmf"), [])
  store.upsert({ id: "1", company: "usmf", updatedAt: "" })
  store.upsert({ id: "2", company: "demf", updatedAt: "" })
  store.upsert({ id: "1", company: "usmf", updatedAt: "", extra: true })
  assert.equal(store.list("USMF").length, 1)
  assert.equal(store.get("1").extra, true)
  assert.equal(store.getSnapshot(), store.getSnapshot(), "snapshot is referentially stable")
  let notified = 0
  store.subscribe(() => notified++)
  store.remove("1")
  assert.equal(notified, 1)
  assert.equal(store.list().length, 1)
  raw = "{not json"
  assert.deepEqual(store.list(), [])
})
