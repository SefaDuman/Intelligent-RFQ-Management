import { differenceInCalendarDays, isValid, parseISO } from "date-fns"
import { isOpenStatus, type RfqCaseDetail } from "@/domain/types"

export const HEALTH_RULES = { deadlineDays: 7, minimumReplies: 2, lowResponsePct: 50, priceSpreadPct: 20 } as const
export type HealthSeverity = "high" | "medium" | "info"
export interface HealthFinding {
  id: string
  severity: HealthSeverity
  title: string
  evidence: string
  action: "Review RFQ" | "Compare offers"
}
export interface RfqHealth {
  caseId: string
  name: string
  company: string
  findings: HealthFinding[]
}

function dateOnly(value?: string) {
  if (!value) return undefined
  const date = parseISO(value.slice(0, 10))
  return isValid(date) && date.getFullYear() > 1900 ? date : undefined
}

export function evaluateRfqHealth(detail: RfqCaseDetail, now = new Date()): RfqHealth {
  const { header, lines, replies } = detail
  const result: RfqHealth = { caseId: header.rfqCaseId, name: header.name, company: header.company, findings: [] }
  if (!isOpenStatus(header.status)) return result
  const add = (id: string, severity: HealthSeverity, title: string, evidence: string, compare = false) =>
    result.findings.push({ id, severity, title, evidence, action: compare ? "Compare offers" : "Review RFQ" })
  const deadline = dateOnly(header.expiryDate)
  const days = deadline ? differenceInCalendarDays(deadline, now) : undefined
  const received = replies.filter((reply) => reply.status === "Received")
  const invited = replies.filter((reply) => ["Sent", "Received", "Accepted", "Rejected", "Declined"].includes(reply.status))
  if (days === undefined) add("deadline-unknown", "info", "Reply deadline unavailable", "No valid reply deadline is available; deadline and near-deadline response checks cannot run.")
  else {
    if (days < 0) add("overdue", "high", "Reply deadline passed", `Reply deadline ${header.expiryDate?.slice(0, 10)} was ${-days} day(s) ago.`)
    else if (days <= HEALTH_RULES.deadlineDays) add("due-soon", days <= 2 ? "high" : "medium", "Reply deadline approaching", `Reply deadline ${header.expiryDate?.slice(0, 10)} is ${days === 0 ? "today" : `in ${days} day(s)`}.`)
    if (days <= HEALTH_RULES.deadlineDays) {
      if (received.length < HEALTH_RULES.minimumReplies) add("few-replies", "high", "Fewer than two received replies", `${received.length} received replies; minimum for comparison is ${HEALTH_RULES.minimumReplies}.`)
      const answered = invited.filter((reply) => ["Received", "Accepted", "Rejected"].includes(reply.status)).length
      const rate = invited.length ? answered / invited.length * 100 : undefined
      if (rate !== undefined && rate < HEALTH_RULES.lowResponsePct) add("low-response", "medium", "Low vendor response rate", `${answered} of ${invited.length} sent vendor RFQs have a bid (${rate.toFixed(1)}%); below ${HEALTH_RULES.lowResponsePct}%. Declined bids remain in the denominator; drafts, canceled and removed RFQs are excluded.`)
    }
  }
  if (!lines.length) add("no-lines", "medium", "Requested lines unavailable", "Line coverage and price-spread checks cannot run without requested lines.")
  const comparable: { id: string; total: number }[] = []
  for (const reply of received) {
    const issues: string[] = []
    let total = 0
    let priceComparable = lines.length > 0 && !!header.currency && reply.currency === header.currency
    if (!priceComparable && lines.length) issues.push("currency differs from the RFQ or is missing")
    for (const requested of lines) {
      const matches = (reply.lines ?? []).filter((line) => line.lineNumber === requested.lineNumber && line.quoted)
      const line = matches[0]
      if (matches.length !== 1 || !line) {
        issues.push(`line ${requested.lineNumber}: ${matches.length ? "duplicate quoted lines" : "not quoted"}`)
        priceComparable = false
        continue
      }
      if (![line.unitPrice, line.netAmount, line.quantity, line.discountPct].every(Number.isFinite) || line.unitPrice <= 0 || line.netAmount <= 0 || line.discountPct < 0 || line.discountPct > 100) {
        issues.push(`line ${requested.lineNumber}: missing or invalid price/amount/discount`)
        priceComparable = false
      }
      if (!Number.isFinite(requested.quantity) || requested.quantity <= 0 || line.quantity !== requested.quantity || line.itemNumber !== requested.itemNumber) {
        issues.push(`line ${requested.lineNumber}: item or quantity does not match the request`)
        priceComparable = false
      }
      if ((!Number.isFinite(line.leadTimeDays) || (line.leadTimeDays ?? -1) < 0) && !dateOnly(line.deliveryDate ?? reply.deliveryDate)) {
        issues.push(`line ${requested.lineNumber}: no valid lead time or delivery date`)
      }
      total += line.netAmount
    }
    if (!reply.paymentTerms?.trim()) issues.push("payment terms unavailable")
    const validUntil = dateOnly(reply.validUntil)
    if (!validUntil) issues.push("quote validity unavailable")
    else if (differenceInCalendarDays(validUntil, now) < 0) {
      issues.push(`quote expired on ${reply.validUntil?.slice(0, 10)}`)
      priceComparable = false
    }
    if (issues.length) add(`offer-${reply.rfqId}`, "medium", `${reply.vendorName}: offer needs review`, `Reply ${reply.rfqId}: ${issues.join("; ")}.`, received.length >= 2)
    if (priceComparable && Number.isFinite(total) && total > 0) comparable.push({ id: reply.rfqId, total })
  }
  if (received.length >= 2 && comparable.length === received.length) {
    const low = Math.min(...comparable.map((offer) => offer.total))
    const high = Math.max(...comparable.map((offer) => offer.total))
    const spread = (high - low) / low * 100
    if (spread >= HEALTH_RULES.priceSpreadPct) add("price-spread", "medium", "Wide comparable quote spread", `${header.currency} ${low.toFixed(2)}–${high.toFixed(2)} across replies ${comparable.map((offer) => offer.id).join(", ")}: ${spread.toFixed(1)}% above the lowest offer (threshold ${HEALTH_RULES.priceSpreadPct}%). Same currency, requested items and quantities, and full line coverage; no FX, taxes or extra charges inferred.`, true)
  } else if (received.length >= 2) {
    add("spread-unavailable", "info", "Price-spread check unavailable", "Received offers are not all comparable: check coverage, currency, item, quantity, prices or expired validity. No total-price anomaly conclusion was made.", true)
  }
  return result
}
