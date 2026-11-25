import type { RfqCaseLine, RfqReply } from "@/domain/types"

export interface ScenarioConstraints {
  /** Maximum number of vendors that may receive business. */
  maxVendors?: number
  /** No vendor may receive more than this share of the spend (0 - 100). */
  maxSharePct?: number
  /** Every vendor that is used must receive at least this share (0 - 100). */
  minSharePct?: number
  /** Vendor RFQ ids that must receive business. */
  requiredRfqIds: string[]
  /** Vendor RFQ ids that are excluded from the award. */
  excludedRfqIds: string[]
  /** Offers with a longer line lead time (or an unknown one) are not eligible. */
  maxLeadTimeDays?: number
}

export const NO_CONSTRAINTS: ScenarioConstraints = { requiredRfqIds: [], excludedRfqIds: [] }

export interface ScenarioShare {
  rfqId: string
  vendorName: string
  amount: number
  sharePct: number
  lines: number
}

export interface ScenarioResult {
  feasible: boolean
  /** Why no award satisfies the constraints. */
  reason?: string
  assignments: { lineNumber: number; rfqId: string; vendorName: string; netAmount: number }[]
  total: number
  vendorsUsed: number
  shares: ScenarioShare[]
  maxLeadTimeDays?: number
}

const MAX_OFFERS = 10
const EPS = 1e-9

interface Quote {
  netAmount: number
  leadTimeDays?: number
}

function quoteOf(reply: RfqReply, lineNumber: number): Quote | undefined {
  const line = reply.lines?.find((l) => l.lineNumber === lineNumber && l.quoted && l.unitPrice > 0)
  return line ? { netAmount: line.netAmount, leadTimeDays: line.leadTimeDays } : undefined
}

function infeasible(reason: string): ScenarioResult {
  return { feasible: false, reason, assignments: [], total: 0, vendorsUsed: 0, shares: [] }
}

/**
 * Finds the lowest-cost award that satisfies the constraints by trying every vendor subset (≤ 10 offers).
 * Each line goes to the cheapest eligible vendor in the subset. When a concentration cap is set, lines are
 * moved off over-cap vendors at the smallest extra cost; that repair step is a heuristic, not a proof of optimality.
 */
export function optimizeAward(caseLines: RfqCaseLine[], replies: RfqReply[], constraints: ScenarioConstraints = NO_CONSTRAINTS): ScenarioResult {
  const offers = replies.filter((r) => !constraints.excludedRfqIds.includes(r.rfqId)).slice(0, MAX_OFFERS)
  if (!caseLines.length) return infeasible("The RFQ has no lines.")
  if (!offers.length) return infeasible("No offers are available after exclusions.")

  const quotes = offers.map((reply) =>
    new Map(
      caseLines.flatMap((cl) => {
        const quote = quoteOf(reply, cl.lineNumber)
        if (!quote) return []
        if (constraints.maxLeadTimeDays !== undefined && (quote.leadTimeDays === undefined || quote.leadTimeDays > constraints.maxLeadTimeDays)) return []
        return [[cl.lineNumber, quote] as const]
      }),
    ),
  )
  const required = offers.map((o, i) => (constraints.requiredRfqIds.includes(o.rfqId) ? i : -1)).filter((i) => i >= 0)
  const maxVendors = constraints.maxVendors ?? offers.length
  const failures = new Map<string, number>()
  const fail = (reason: string) => failures.set(reason, (failures.get(reason) ?? 0) + 1)

  let best: { total: number; vendors: number; assign: Map<number, number> } | undefined

  for (let mask = 1; mask < 1 << offers.length; mask++) {
    const subset = offers.map((_, i) => i).filter((i) => mask & (1 << i))
    if (subset.length > maxVendors) continue
    if (!required.every((i) => subset.includes(i))) continue

    const assign = new Map<number, number>()
    let covered = true
    for (const cl of caseLines) {
      let pick = -1
      for (const i of subset) {
        const q = quotes[i].get(cl.lineNumber)
        if (q && (pick < 0 || q.netAmount < quotes[pick].get(cl.lineNumber)!.netAmount - EPS)) pick = i
      }
      if (pick < 0) { covered = false; break }
      assign.set(cl.lineNumber, pick)
    }
    if (!covered) { fail("No eligible offer covers every line (check lead-time cap, exclusions and unquoted lines)."); continue }

    const amounts = () => {
      const map = new Map<number, number>(subset.map((i) => [i, 0]))
      for (const [line, i] of assign) map.set(i, map.get(i)! + quotes[i].get(line)!.netAmount)
      return map
    }

    if (constraints.maxSharePct !== undefined) {
      for (let guard = 0; guard < caseLines.length * subset.length + 1; guard++) {
        const by = amounts()
        const total = [...by.values()].reduce((a, b) => a + b, 0)
        const over = [...by].find(([, amount]) => total > 0 && (amount / total) * 100 > constraints.maxSharePct! + EPS)
        if (!over) break
        let move: { line: number; to: number; delta: number } | undefined
        for (const [line, from] of assign) {
          if (from !== over[0]) continue
          for (const to of subset) {
            const alt = to === from ? undefined : quotes[to].get(line)
            if (!alt) continue
            const delta = alt.netAmount - quotes[from].get(line)!.netAmount
            if (!move || delta < move.delta) move = { line, to, delta }
          }
        }
        if (!move) break
        assign.set(move.line, move.to)
      }
    }

    const by = amounts()
    const total = [...by.values()].reduce((a, b) => a + b, 0)
    if (constraints.maxSharePct !== undefined && [...by.values()].some((a) => total > 0 && (a / total) * 100 > constraints.maxSharePct! + EPS)) {
      fail("The concentration cap cannot be met with the available offers."); continue
    }
    // Subsets with an idle vendor are covered by a smaller subset, except for required vendors.
    if (subset.some((i) => (by.get(i) ?? 0) === 0 && required.includes(i))) { fail("A required vendor would receive no lines."); continue }
    if (subset.some((i) => (by.get(i) ?? 0) === 0)) continue
    if (constraints.minSharePct !== undefined && [...by.values()].some((a) => total > 0 && (a / total) * 100 < constraints.minSharePct! - EPS)) {
      fail("A vendor would fall below the minimum share."); continue
    }
    if (!best || total < best.total - EPS || (Math.abs(total - best.total) <= EPS && subset.length < best.vendors)) {
      best = { total, vendors: subset.length, assign: new Map(assign) }
    }
  }

  if (!best) {
    const top = [...failures].sort((a, b) => b[1] - a[1])[0]?.[0]
    return infeasible(top ?? "No award satisfies the constraints.")
  }

  const assignments = caseLines.map((cl) => {
    const i = best!.assign.get(cl.lineNumber)!
    return { lineNumber: cl.lineNumber, rfqId: offers[i].rfqId, vendorName: offers[i].vendorName, netAmount: quotes[i].get(cl.lineNumber)!.netAmount }
  })
  const shares: ScenarioShare[] = [...new Set(assignments.map((a) => a.rfqId))].map((rfqId) => {
    const mine = assignments.filter((a) => a.rfqId === rfqId)
    const amount = mine.reduce((s, a) => s + a.netAmount, 0)
    return { rfqId, vendorName: mine[0].vendorName, amount, sharePct: best!.total > 0 ? (amount / best!.total) * 100 : 0, lines: mine.length }
  }).sort((a, b) => b.amount - a.amount)
  const leads = assignments.map((a) => quotes[offers.findIndex((o) => o.rfqId === a.rfqId)].get(a.lineNumber)?.leadTimeDays).filter((d): d is number => d !== undefined)

  return {
    feasible: true,
    assignments,
    total: best.total,
    vendorsUsed: shares.length,
    shares,
    maxLeadTimeDays: leads.length ? Math.max(...leads) : undefined,
  }
}

export interface ConsolidationPoint {
  vendors: number
  result: ScenarioResult
  /** Extra cost compared with the best split (same constraints, any number of vendors). */
  premium?: number
}

/** Lowest total cost when the award is limited to 1, 2, … vendors. */
export function consolidationCurve(caseLines: RfqCaseLine[], replies: RfqReply[], constraints: ScenarioConstraints = NO_CONSTRAINTS): ConsolidationPoint[] {
  const count = Math.min(replies.filter((r) => !constraints.excludedRfqIds.includes(r.rfqId)).length, MAX_OFFERS, 6)
  const points = Array.from({ length: count }, (_, i) => ({
    vendors: i + 1,
    result: optimizeAward(caseLines, replies, { ...constraints, maxVendors: Math.min(i + 1, constraints.maxVendors ?? Infinity) }),
  }))
  const floor = Math.min(...points.filter((p) => p.result.feasible).map((p) => p.result.total))
  return points.map((p) => ({ ...p, premium: p.result.feasible && Number.isFinite(floor) ? p.result.total - floor : undefined }))
}
