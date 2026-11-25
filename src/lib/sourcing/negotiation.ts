import type { StoredRecord } from "@/data/sourcing-store"

export type TargetStrategy = "match-lowest" | "half-gap" | "percent"

export const STRATEGY_LABELS: Record<TargetStrategy, string> = {
  "match-lowest": "Match the lowest bid",
  "half-gap": "Close half the gap to the lowest bid",
  percent: "Fixed % reduction",
}

export interface RoundTarget {
  rfqId: string
  vendorAccount: string
  vendorName: string
  email?: string
  /** The vendor's total when the round was opened. */
  snapshotTotal: number
  targetTotal?: number
  included: boolean
}

export interface NegotiationRound extends StoredRecord {
  caseId: string
  number: number
  replyBy?: string
  strategy: TargetStrategy
  percent: number
  note?: string
  targets: RoundTarget[]
  /** Vendor RFQ ids a request e-mail was sent to. */
  requestedRfqIds: string[]
}

export interface BidSnapshot {
  rfqId: string
  vendorAccount: string
  vendorName: string
  email?: string
  total: number
}

/** Vendors within this premium over the lowest bid are included by default. */
export const DEFAULT_INCLUSION_PREMIUM = 0.25

export function suggestTarget(total: number, lowest: number, strategy: TargetStrategy, percent: number): number | undefined {
  if (!(total > 0) || !(lowest > 0)) return undefined
  const isLowest = total <= lowest
  const raw =
    strategy === "match-lowest" ? (isLowest ? undefined : lowest)
    : strategy === "half-gap" ? (isLowest ? undefined : total - (total - lowest) / 2)
    : total * (1 - percent / 100)
  return raw === undefined ? undefined : Math.round(raw * 100) / 100
}

export function buildTargets(bids: BidSnapshot[], strategy: TargetStrategy, percent: number): RoundTarget[] {
  const valid = bids.filter((b) => b.total > 0)
  const lowest = valid.length ? Math.min(...valid.map((b) => b.total)) : 0
  return bids.map((b) => ({
    rfqId: b.rfqId,
    vendorAccount: b.vendorAccount,
    vendorName: b.vendorName,
    email: b.email,
    snapshotTotal: b.total,
    targetTotal: suggestTarget(b.total, lowest, strategy, percent),
    included: b.total > 0 && b.total <= lowest * (1 + DEFAULT_INCLUSION_PREMIUM),
  }))
}

export function newRound(company: string, caseId: string, number: number, bids: BidSnapshot[], strategy: TargetStrategy = "half-gap", percent = 5): NegotiationRound {
  return {
    id: crypto.randomUUID(),
    company,
    caseId,
    updatedAt: new Date().toISOString(),
    number,
    strategy,
    percent,
    targets: buildTargets(bids, strategy, percent),
    requestedRfqIds: [],
  }
}

export type MovementStatus = "improved" | "unchanged" | "worse"

export interface TargetMovement {
  target: RoundTarget
  current?: number
  delta?: number
  deltaPct?: number
  status: MovementStatus
  metTarget: boolean
}

/** Compares the live bid totals with the snapshot taken when the round opened. */
export function measureRound(round: NegotiationRound, currentTotals: Record<string, number | undefined>): TargetMovement[] {
  return round.targets
    .filter((t) => t.included)
    .map((target) => {
      const current = currentTotals[target.rfqId]
      const delta = current !== undefined && current > 0 ? current - target.snapshotTotal : undefined
      return {
        target,
        current,
        delta,
        deltaPct: delta !== undefined && target.snapshotTotal > 0 ? (delta / target.snapshotTotal) * 100 : undefined,
        status: delta === undefined || Math.abs(delta) < 0.005 ? "unchanged" : delta < 0 ? "improved" : "worse",
        metTarget: target.targetTotal !== undefined && current !== undefined && current > 0 && current <= target.targetTotal + 0.005,
      }
    })
}

export interface RoundSavings {
  amount: number
  pct: number
  improvedVendors: number
}

/** Saving achieved by improved bids only; worse bids do not offset it. */
export function roundSavings(movements: TargetMovement[]): RoundSavings {
  const improved = movements.filter((m) => m.status === "improved" && m.delta !== undefined)
  const amount = improved.reduce((s, m) => s - m.delta!, 0)
  const base = improved.reduce((s, m) => s + m.target.snapshotTotal, 0)
  return { amount, pct: base > 0 ? (amount / base) * 100 : 0, improvedVendors: improved.length }
}

export interface RequestEmailInput {
  caseId: string
  caseName: string
  vendorName: string
  roundNumber: number
  replyBy?: string
  currency: string
  ownTotal: number
  targetTotal?: number
  senderName: string
  note?: string
}

const money = (value: number, currency: string) => `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

/** Best-and-final-offer request. Only the recipient's own figures appear; competing bids are never disclosed. */
export function buildRequestEmail(input: RequestEmailInput): { subject: string; message: string } {
  const lines = [
    `Thank you for your quotation for "${input.caseName}" (${input.caseId}).`,
    "",
    `We are running a best-and-final-offer round (round ${input.roundNumber}). Your current total is ${money(input.ownTotal, input.currency)}.`,
  ]
  if (input.targetTotal !== undefined) lines.push(`To stay competitive we are looking for a total of ${money(input.targetTotal, input.currency)} or better.`)
  else lines.push("Please review your pricing, lead times and terms and submit your best and final offer.")
  if (input.note?.trim()) lines.push("", input.note.trim())
  lines.push("", `Please submit your revised quotation${input.replyBy ? ` by ${input.replyBy}` : ""} through the vendor portal or by replying to this e-mail. Unchanged offers will be treated as final.`, "", `Kind regards,`, input.senderName)
  return { subject: `Best and final offer request – ${input.caseId} ${input.caseName}`, message: lines.join("\n") }
}
