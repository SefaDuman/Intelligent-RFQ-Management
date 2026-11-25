import { hasReplied, type RfqCase, type RfqReply, type Vendor } from "@/domain/types"

export interface ShortlistInput {
  vendors: Vendor[]
  cases: RfqCase[]
  replies: RfqReply[]
  category?: string
}

export interface RankedSupplier {
  vendor: Vendor
  /** 0 - 100 */
  score: number
  components: { category: number; performance: number; responsiveness: number; experience: number }
  reasons: string[]
  warnings: string[]
}

export const SHORTLIST_WEIGHTS = { category: 0.35, performance: 0.3, responsiveness: 0.2, experience: 0.15 } as const

/** Vendor RFQs that were actually issued to the vendor. */
const wasInvited = (reply: RfqReply) => !["Created", "Removed", "Canceled"].includes(reply.status)

const sameText = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

function performanceScore(vendor: Vendor) {
  const rating = vendor.rating !== undefined ? (vendor.rating / 5) * 100 : undefined
  const otd = vendor.onTimeDeliveryPct
  if (rating !== undefined && otd !== undefined) return rating * 0.6 + otd * 0.4
  return rating ?? otd
}

/** Ranks the vendor directory for a sourcing event using category fit, performance and bidding history. */
export function rankSuppliers({ vendors, cases, replies, category }: ShortlistInput): RankedSupplier[] {
  const caseCategory = new Map(cases.map((c) => [c.rfqCaseId, c.procurementCategory]))
  const byVendor = new Map<string, RfqReply[]>()
  for (const reply of replies) {
    if (!wasInvited(reply)) continue
    byVendor.set(reply.vendorAccount, [...(byVendor.get(reply.vendorAccount) ?? []), reply])
  }

  return vendors
    .map((vendor): RankedSupplier => {
      const history = byVendor.get(vendor.accountNumber) ?? []
      const responded = history.filter((r) => hasReplied(r.status))
      const declined = history.filter((r) => r.status === "Declined")
      const inCategory = category ? history.filter((r) => sameText(caseCategory.get(r.rfqCaseId), category)) : []
      const respondedInCategory = inCategory.filter((r) => hasReplied(r.status))
      const reasons: string[] = []
      const warnings: string[] = []

      let categoryFit = 50
      if (category) {
        if (sameText(vendor.vendorGroup, category)) {
          categoryFit = 100
          reasons.push(`Vendor group matches ${category}`)
        } else if (respondedInCategory.length) {
          categoryFit = 70
          reasons.push(`Quoted ${respondedInCategory.length} ${category} RFQ${respondedInCategory.length === 1 ? "" : "s"} before`)
        } else if (inCategory.length) {
          categoryFit = 40
        } else {
          categoryFit = 0
        }
      }

      const perf = performanceScore(vendor)
      if (perf === undefined) warnings.push("No rating or delivery history")
      else if (perf >= 80) reasons.push(`Strong performance (${Math.round(perf)}/100)`)
      if (vendor.rating !== undefined && vendor.rating < 3) warnings.push(`Low rating (${vendor.rating.toFixed(1)}/5)`)
      if (vendor.onTimeDeliveryPct !== undefined && vendor.onTimeDeliveryPct < 80) warnings.push(`On-time delivery ${Math.round(vendor.onTimeDeliveryPct)}%`)

      let responsiveness = 50
      if (history.length) {
        responsiveness = (responded.length / history.length) * 100
        if (responsiveness >= 75 && history.length >= 2) reasons.push(`Replied to ${responded.length} of ${history.length} RFQs`)
        if (declined.length && declined.length / history.length >= 0.5) warnings.push("Often declines to quote")
        if (responsiveness < 50 && history.length >= 2) warnings.push(`Replied to only ${responded.length} of ${history.length} RFQs`)
      }

      const experience = Math.min(100, responded.length * 20)
      if (!vendor.email) warnings.push("No e-mail address")

      const components = { category: categoryFit, performance: perf ?? 50, responsiveness, experience }
      const score =
        components.category * SHORTLIST_WEIGHTS.category +
        components.performance * SHORTLIST_WEIGHTS.performance +
        components.responsiveness * SHORTLIST_WEIGHTS.responsiveness +
        components.experience * SHORTLIST_WEIGHTS.experience
      return { vendor, score, components, reasons, warnings }
    })
    .sort((a, b) => b.score - a.score || a.vendor.name.localeCompare(b.vendor.name))
}

/** Suggested invitees: best-scoring vendors with some evidence of category fit that can actually be contacted. */
export function recommendShortlist(ranked: RankedSupplier[], size = 5, minScore = 50) {
  return ranked.filter((r) => !!r.vendor.email && r.score >= minScore && r.components.category > 0).slice(0, size)
}
