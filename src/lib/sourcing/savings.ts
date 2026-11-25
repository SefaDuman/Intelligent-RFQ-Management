import type { StoredRecord } from "@/data/sourcing-store"
import type { RfqCaseDetail, RfqReply } from "@/domain/types"

export type SavingsBasis = "target" | "average-bid"

export interface AwardedSaving {
  caseId: string
  name: string
  category?: string
  currency: string
  vendors: string[]
  awardedTotal: number
  baseline: number
  basis: SavingsBasis
  bids: number
  savings: number
  savingsPct: number
}

export interface SkippedAward {
  caseId: string
  name: string
  reason: string
}

const quotedLine = (reply: RfqReply, lineNumber: number) => reply.lines?.find((l) => l.lineNumber === lineNumber && l.quoted && l.unitPrice > 0)

const replyTotal = (reply: RfqReply) => reply.totalAmount ?? reply.lines?.filter((l) => l.quoted).reduce((s, l) => s + l.netAmount, 0) ?? 0

/** Measures savings on RFQs that have an Accepted vendor reply, against target price or the average bid. */
export function deriveAwardedSavings(details: RfqCaseDetail[]): { savings: AwardedSaving[]; skipped: SkippedAward[] } {
  const savings: AwardedSaving[] = []
  const skipped: SkippedAward[] = []

  for (const { header, lines, replies } of details) {
    const accepted = replies.filter((r) => r.status === "Accepted")
    if (!accepted.length) continue
    const skip = (reason: string) => skipped.push({ caseId: header.rfqCaseId, name: header.name, reason })

    let awardedTotal: number
    if (lines.length && accepted.every((r) => r.lines?.length)) {
      let total = 0
      let covered = true
      for (const cl of lines) {
        const amounts = accepted.map((r) => quotedLine(r, cl.lineNumber)?.netAmount).filter((a): a is number => a !== undefined)
        if (!amounts.length) { covered = false; break }
        total += Math.min(...amounts)
      }
      if (!covered) { skip("The accepted replies do not cover every RFQ line."); continue }
      awardedTotal = total
    } else {
      awardedTotal = accepted.reduce((s, r) => s + replyTotal(r), 0)
    }
    if (!(awardedTotal > 0)) { skip("The accepted reply has no total."); continue }

    const targetTotal = lines.reduce((s, l) => s + (l.targetUnitPrice ?? 0) * l.quantity, 0)
    const hasFullTarget = lines.length > 0 && lines.every((l) => (l.targetUnitPrice ?? 0) > 0)
    const comparableBids = replies
      .filter((r) => ["Received", "Accepted", "Rejected"].includes(r.status))
      .filter((r) => !lines.length || !r.lines?.length || lines.every((cl) => quotedLine(r, cl.lineNumber)))
      .map(replyTotal)
      .filter((t) => t > 0)

    let baseline: number
    let basis: SavingsBasis
    if (hasFullTarget) {
      baseline = targetTotal
      basis = "target"
    } else if (comparableBids.length >= 2) {
      baseline = comparableBids.reduce((a, b) => a + b, 0) / comparableBids.length
      basis = "average-bid"
    } else {
      skip("No target price on every line and fewer than two comparable bids.")
      continue
    }

    savings.push({
      caseId: header.rfqCaseId,
      name: header.name,
      category: header.procurementCategory,
      currency: header.currency,
      vendors: accepted.map((r) => r.vendorName),
      awardedTotal,
      baseline,
      basis,
      bids: comparableBids.length,
      savings: baseline - awardedTotal,
      savingsPct: ((baseline - awardedTotal) / baseline) * 100,
    })
  }
  return { savings, skipped }
}

export type InitiativeStatus = "identified" | "negotiated" | "realized"

/** A savings item the buyer records by hand (for example a contract renegotiation). */
export interface SavingsInitiative extends StoredRecord {
  title: string
  category?: string
  currency: string
  baseline: number
  negotiated: number
  status: InitiativeStatus
  caseId?: string
  note?: string
}

export interface SavingsSummaryRow {
  currency: string
  category: string
  baseline: number
  savings: number
  count: number
}

export interface SavingsTotals {
  currency: string
  baseline: number
  savings: number
  savingsPct: number
  awardedSavings: number
  initiativeSavings: number
  count: number
  byCategory: SavingsSummaryRow[]
}

/** Totals per currency; identified-only initiatives are excluded because the saving is not yet agreed. */
export function summarizeSavings(awarded: AwardedSaving[], initiatives: SavingsInitiative[]): SavingsTotals[] {
  const rows: { currency: string; category: string; baseline: number; savings: number; fromAward: boolean }[] = [
    ...awarded.map((a) => ({ currency: a.currency, category: a.category ?? "Uncategorised", baseline: a.baseline, savings: a.savings, fromAward: true })),
    ...initiatives
      .filter((i) => i.status !== "identified")
      .map((i) => ({ currency: i.currency, category: i.category ?? "Uncategorised", baseline: i.baseline, savings: i.baseline - i.negotiated, fromAward: false })),
  ]
  const currencies = [...new Set(rows.map((r) => r.currency))]
  return currencies.map((currency) => {
    const mine = rows.filter((r) => r.currency === currency)
    const baseline = mine.reduce((s, r) => s + r.baseline, 0)
    const savings = mine.reduce((s, r) => s + r.savings, 0)
    const byCategory = [...new Set(mine.map((r) => r.category))].map((category) => {
      const inCategory = mine.filter((r) => r.category === category)
      return {
        currency,
        category,
        baseline: inCategory.reduce((s, r) => s + r.baseline, 0),
        savings: inCategory.reduce((s, r) => s + r.savings, 0),
        count: inCategory.length,
      }
    }).sort((a, b) => b.savings - a.savings)
    return {
      currency,
      baseline,
      savings,
      savingsPct: baseline > 0 ? (savings / baseline) * 100 : 0,
      awardedSavings: mine.filter((r) => r.fromAward).reduce((s, r) => s + r.savings, 0),
      initiativeSavings: mine.filter((r) => !r.fromAward).reduce((s, r) => s + r.savings, 0),
      count: mine.length,
      byCategory,
    }
  }).sort((a, b) => b.baseline - a.baseline)
}
