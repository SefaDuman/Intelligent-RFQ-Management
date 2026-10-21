import { differenceInCalendarDays, format, startOfMonth, subMonths } from "date-fns"
import { hasReplied, isOpenStatus, RFQ_STATUSES, type RfqCase, type RfqReply, type RfqStatus } from "@/domain/types"
import { daysUntil, toDate } from "./format"

export interface CaseProgress {
  rfq: RfqCase
  invited: number
  replied: number
  bestQuote?: number
  daysLeft?: number
}

export interface VendorPerformance {
  vendorAccount: string
  vendorName: string
  invited: number
  replied: number
  responseRate: number
  avgResponseDays?: number
  wins: number
}

export interface Dashboard {
  openCount: number
  awaitingReplyCount: number
  readyToCompareCount: number
  expiringSoonCount: number
  overdueCount: number
  repliesLast30: number
  responseRate: number
  avgResponseDays?: number
  openBestQuoteValue: number
  potentialSavings: number
  statusBreakdown: { status: RfqStatus; count: number }[]
  monthly: { month: string; created: number; replies: number; awarded: number }[]
  vendors: VendorPerformance[]
  categories: { category: string; open: number; awardedValue: number; quotedValue: number }[]
  pipeline: CaseProgress[]
  deadlines: CaseProgress[]
  currency: string
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined)

export function buildDashboard(cases: RfqCase[], replies: RfqReply[]): Dashboard {
  const now = new Date()
  const byCase = new Map<string, RfqReply[]>()
  for (const r of replies) byCase.set(r.rfqCaseId, [...(byCase.get(r.rfqCaseId) ?? []), r])

  const progress = (rfq: RfqCase): CaseProgress => {
    const caseReplies = byCase.get(rfq.rfqCaseId) ?? []
    const answered = caseReplies.filter((r) => hasReplied(r.status))
    const totals = answered.map((r) => r.totalAmount).filter((t): t is number => t !== undefined && t > 0)
    return {
      rfq,
      invited: caseReplies.filter((r) => r.status !== "Created").length,
      replied: answered.length,
      bestQuote: totals.length ? Math.min(...totals) : undefined,
      daysLeft: daysUntil(rfq.expiryDate),
    }
  }

  const open = cases.filter((c) => isOpenStatus(c.status))
  const openProgress = open.map(progress)

  const sent = replies.filter((r) => r.status !== "Created" && r.status !== "Canceled" && r.status !== "Removed")
  const answered = replies.filter((r) => hasReplied(r.status))
  const responseDays = answered
    .map((r) => (r.sentDate && r.replyDate ? differenceInCalendarDays(toDate(r.replyDate)!, toDate(r.sentDate)!) : undefined))
    .filter((d): d is number => d !== undefined && d >= 0)

  let potentialSavings = 0
  for (const p of openProgress) {
    const totals = (byCase.get(p.rfq.rfqCaseId) ?? [])
      .filter((r) => hasReplied(r.status) && r.totalAmount)
      .map((r) => r.totalAmount!)
    if (totals.length >= 2) potentialSavings += mean(totals)! - Math.min(...totals)
  }

  const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(now, 5 - i)))
  const monthKey = (value?: string) => (value ? format(toDate(value)!, "yyyy-MM") : "")
  const monthly = months.map((m) => {
    const key = format(m, "yyyy-MM")
    return {
      month: format(m, "MMM"),
      created: cases.filter((c) => monthKey(c.createdDate) === key).length,
      replies: answered.filter((r) => monthKey(r.replyDate) === key).length,
      awarded: replies.filter((r) => r.status === "Accepted" && monthKey(r.replyDate) === key).length,
    }
  })

  const vendorMap = new Map<string, VendorPerformance & { days: number[] }>()
  for (const r of replies) {
    if (r.status === "Created") continue
    const v = vendorMap.get(r.vendorAccount) ?? {
      vendorAccount: r.vendorAccount,
      vendorName: r.vendorName,
      invited: 0,
      replied: 0,
      responseRate: 0,
      wins: 0,
      days: [],
    }
    v.invited++
    if (hasReplied(r.status)) {
      v.replied++
      if (r.sentDate && r.replyDate) v.days.push(differenceInCalendarDays(toDate(r.replyDate)!, toDate(r.sentDate)!))
    }
    if (r.status === "Accepted") v.wins++
    vendorMap.set(r.vendorAccount, v)
  }
  const vendors = [...vendorMap.values()]
    .map(({ days, ...v }) => ({ ...v, responseRate: v.invited ? (v.replied / v.invited) * 100 : 0, avgResponseDays: mean(days) }))
    .sort((a, b) => b.responseRate - a.responseRate || b.replied - a.replied)

  const categoryMap = new Map<string, { category: string; open: number; awardedValue: number; quotedValue: number }>()
  for (const c of cases) {
    const key = c.procurementCategory || "Uncategorized"
    const entry = categoryMap.get(key) ?? { category: key, open: 0, awardedValue: 0, quotedValue: 0 }
    const p = progress(c)
    if (isOpenStatus(c.status)) {
      entry.open++
      entry.quotedValue += p.bestQuote ?? 0
    }
    const accepted = (byCase.get(c.rfqCaseId) ?? []).find((r) => r.status === "Accepted")
    entry.awardedValue += accepted?.totalAmount ?? 0
    categoryMap.set(key, entry)
  }

  return {
    openCount: open.length,
    awaitingReplyCount: openProgress.filter((p) => p.invited > p.replied).length,
    readyToCompareCount: openProgress.filter((p) => p.replied >= 2).length,
    expiringSoonCount: openProgress.filter((p) => p.daysLeft !== undefined && p.daysLeft >= 0 && p.daysLeft <= 7).length,
    overdueCount: openProgress.filter((p) => p.daysLeft !== undefined && p.daysLeft < 0).length,
    repliesLast30: answered.filter((r) => {
      const d = toDate(r.replyDate)
      return d && differenceInCalendarDays(now, d) <= 30
    }).length,
    responseRate: sent.length ? (answered.length / sent.length) * 100 : 0,
    avgResponseDays: mean(responseDays),
    openBestQuoteValue: openProgress.reduce((s, p) => s + (p.bestQuote ?? 0), 0),
    potentialSavings,
    statusBreakdown: RFQ_STATUSES.map((status) => ({ status, count: cases.filter((c) => c.status === status).length })).filter(
      (s) => s.count > 0,
    ),
    monthly,
    vendors,
    categories: [...categoryMap.values()].sort((a, b) => b.awardedValue + b.quotedValue - (a.awardedValue + a.quotedValue)),
    pipeline: openProgress.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
    deadlines: openProgress
      .filter((p) => p.daysLeft !== undefined && p.daysLeft <= 10)
      .sort((a, b) => a.daysLeft! - b.daysLeft!)
      .slice(0, 6),
    currency: cases[0]?.currency || "USD",
  }
}
