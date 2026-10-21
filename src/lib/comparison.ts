import type { RfqCaseLine, RfqReply, RfqReplyLine, Vendor } from "@/domain/types"

export type Criterion = "price" | "delivery" | "vendor" | "coverage" | "terms"

export type Weights = Record<Criterion, number>

export const CRITERIA: { key: Criterion; label: string; description: string }[] = [
  { key: "price", label: "Price", description: "Normalised total vs. the lowest offer" },
  { key: "delivery", label: "Delivery", description: "Longest line lead time vs. the fastest offer" },
  { key: "vendor", label: "Vendor", description: "Vendor rating and on-time delivery history" },
  { key: "coverage", label: "Coverage", description: "Share of RFQ lines the vendor quoted" },
  { key: "terms", label: "Payment terms", description: "Longer payment terms score higher" },
]

export const WEIGHT_PRESETS: Record<string, { label: string; weights: Weights }> = {
  balanced: { label: "Balanced", weights: { price: 40, delivery: 20, vendor: 20, coverage: 15, terms: 5 } },
  cost: { label: "Cost first", weights: { price: 70, delivery: 10, vendor: 10, coverage: 10, terms: 0 } },
  speed: { label: "Speed first", weights: { price: 25, delivery: 50, vendor: 15, coverage: 10, terms: 0 } },
  risk: { label: "Low risk", weights: { price: 25, delivery: 15, vendor: 40, coverage: 15, terms: 5 } },
}

export type Badge = "best-value" | "lowest-price" | "fastest" | "top-rated" | "best-terms" | "full-coverage"

export const BADGE_LABELS: Record<Badge, string> = {
  "best-value": "Best value",
  "lowest-price": "Lowest price",
  fastest: "Fastest delivery",
  "top-rated": "Top rated vendor",
  "best-terms": "Best payment terms",
  "full-coverage": "Quoted all lines",
}

export interface ReplyMetrics {
  reply: RfqReply
  vendor?: Vendor
  colorIndex: number
  quotedLines: number
  totalLines: number
  coveragePct: number
  /** Sum of quoted line amounts. */
  total: number
  /** Total with unquoted lines imputed from other offers (apples-to-apples). */
  normalizedTotal: number
  maxLeadTimeDays?: number
  avgLeadTimeDays?: number
  paymentDays?: number
  vendorScoreRaw?: number
  scores: Weights
  weighted: number
  rank: number
  deltaVsLowestPct: number
  vsTargetPct?: number
  badges: Badge[]
}

export interface LineCell {
  rfqId: string
  line?: RfqReplyLine
  effectiveUnitPrice?: number
  isBest: boolean
  isWorst: boolean
  deltaPct?: number
}

export interface LineRow {
  caseLine: RfqCaseLine
  cells: LineCell[]
  bestUnitPrice?: number
  spreadPct?: number
  bestRfqId?: string
}

export interface SplitAwardLine {
  caseLine: RfqCaseLine
  rfqId?: string
  vendorName?: string
  netAmount: number
}

export interface SplitAward {
  lines: SplitAwardLine[]
  total: number
  bestSingleVendorTotal: number
  bestSingleVendor?: string
  savings: number
  vendorsUsed: number
}

export interface ComparisonResult {
  metrics: ReplyMetrics[]
  lineRows: LineRow[]
  split: SplitAward
  targetTotal?: number
}

const effectivePrice = (l: RfqReplyLine) => l.unitPrice * (1 - l.discountPct / 100)

/** Extracts the net days from terms like "Net 45" or "2% 10 Net 30". */
export function parsePaymentDays(terms?: string) {
  if (!terms) return undefined
  const numbers = terms.match(/\d+/g)
  return numbers ? Number(numbers[numbers.length - 1]) : undefined
}

function vendorScore(vendor?: Vendor) {
  if (!vendor || (vendor.rating === undefined && vendor.onTimeDeliveryPct === undefined)) return undefined
  const rating = vendor.rating !== undefined ? (vendor.rating / 5) * 100 : undefined
  const otd = vendor.onTimeDeliveryPct
  if (rating !== undefined && otd !== undefined) return rating * 0.6 + otd * 0.4
  return rating ?? otd
}

export function compareReplies(caseLines: RfqCaseLine[], replies: RfqReply[], vendors: Vendor[], weights: Weights): ComparisonResult {
  const vendorByAccount = new Map(vendors.map((v) => [v.accountNumber, v]))
  const lineOf = (reply: RfqReply, lineNumber: number) =>
    reply.lines?.find((l) => l.lineNumber === lineNumber && l.quoted && l.unitPrice > 0)

  // Average quoted amount per line across the selected offers, used for imputation.
  const avgNetByLine = new Map<number, number>()
  for (const cl of caseLines) {
    const quoted = replies.map((r) => lineOf(r, cl.lineNumber)).filter((l): l is RfqReplyLine => !!l)
    const avg = quoted.length ? quoted.reduce((s, l) => s + l.netAmount, 0) / quoted.length : (cl.targetUnitPrice ?? 0) * cl.quantity
    avgNetByLine.set(cl.lineNumber, avg)
  }

  const base = replies.map((reply, index) => {
    const quotedLines = caseLines.map((cl) => lineOf(reply, cl.lineNumber)).filter((l): l is RfqReplyLine => !!l)
    const total = quotedLines.reduce((s, l) => s + l.netAmount, 0)
    const normalizedTotal = caseLines.reduce((s, cl) => {
      const l = lineOf(reply, cl.lineNumber)
      return s + (l ? l.netAmount : avgNetByLine.get(cl.lineNumber) ?? 0)
    }, 0)
    const leadTimes = quotedLines.map((l) => l.leadTimeDays).filter((d): d is number => d !== undefined)
    const vendor = vendorByAccount.get(reply.vendorAccount)
    return {
      reply,
      vendor,
      colorIndex: index,
      quotedLines: quotedLines.length,
      totalLines: caseLines.length,
      coveragePct: caseLines.length ? (quotedLines.length / caseLines.length) * 100 : 0,
      total: total || reply.totalAmount || 0,
      normalizedTotal: normalizedTotal || reply.totalAmount || 0,
      maxLeadTimeDays: leadTimes.length ? Math.max(...leadTimes) : undefined,
      avgLeadTimeDays: leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : undefined,
      paymentDays: parsePaymentDays(reply.paymentTerms),
      vendorScoreRaw: vendorScore(vendor),
    }
  })

  const positive = (values: (number | undefined)[]) => values.filter((v): v is number => v !== undefined && v > 0)
  const minTotal = Math.min(...positive(base.map((b) => b.normalizedTotal)))
  const minLead = Math.min(...positive(base.map((b) => b.maxLeadTimeDays)))
  const maxPay = Math.max(...positive(base.map((b) => b.paymentDays)), 0)
  const maxVendor = Math.max(...positive(base.map((b) => b.vendorScoreRaw)), 0)
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1

  const scored = base.map((b) => {
    const scores: Weights = {
      price: b.normalizedTotal > 0 && Number.isFinite(minTotal) ? (minTotal / b.normalizedTotal) * 100 : 0,
      delivery: b.maxLeadTimeDays && Number.isFinite(minLead) ? (minLead / b.maxLeadTimeDays) * 100 : 50,
      vendor: b.vendorScoreRaw !== undefined ? b.vendorScoreRaw : maxVendor ? 50 : 70,
      coverage: b.coveragePct,
      terms: b.paymentDays && maxPay ? (b.paymentDays / maxPay) * 100 : 50,
    }
    const weighted = (Object.keys(scores) as (keyof Weights)[]).reduce((s, k) => s + scores[k] * weights[k], 0) / weightSum
    const targetTotal = caseLines.reduce((s, cl) => s + (cl.targetUnitPrice ?? 0) * cl.quantity, 0)
    return {
      ...b,
      scores,
      weighted,
      rank: 0,
      deltaVsLowestPct: Number.isFinite(minTotal) && minTotal > 0 ? ((b.normalizedTotal - minTotal) / minTotal) * 100 : 0,
      vsTargetPct: targetTotal > 0 ? ((b.normalizedTotal - targetTotal) / targetTotal) * 100 : undefined,
      badges: [] as Badge[],
    }
  })

  const ranked = [...scored].sort((a, b) => b.weighted - a.weighted)
  ranked.forEach((m, i) => (m.rank = i + 1))

  if (scored.length > 1) {
    const award = (badge: Badge, pickBest: (m: ReplyMetrics) => number | undefined, higherIsBetter: boolean) => {
      const values = scored.map(pickBest)
      const valid = values.filter((v): v is number => v !== undefined)
      if (!valid.length) return
      const best = higherIsBetter ? Math.max(...valid) : Math.min(...valid)
      if (new Set(valid).size === 1 && badge !== "full-coverage") return
      scored.forEach((m, i) => values[i] === best && m.badges.push(badge))
    }
    ranked[0].badges.push("best-value")
    award("lowest-price", (m) => (m.normalizedTotal > 0 ? m.normalizedTotal : undefined), false)
    award("fastest", (m) => m.maxLeadTimeDays, false)
    award("top-rated", (m) => m.vendorScoreRaw, true)
    award("best-terms", (m) => m.paymentDays, true)
  }
  // Only call out full coverage when it differentiates the selected offers.
  if (scored.some((m) => m.coveragePct < 100)) {
    scored.forEach((m) => m.coveragePct === 100 && m.totalLines > 0 && m.badges.push("full-coverage"))
  }

  const lineRows: LineRow[] = caseLines.map((caseLine) => {
    const cells = replies.map((r) => {
      const line = lineOf(r, caseLine.lineNumber)
      return { rfqId: r.rfqId, line, effectiveUnitPrice: line ? effectivePrice(line) : undefined }
    })
    const prices = cells.map((c) => c.effectiveUnitPrice).filter((p): p is number => p !== undefined)
    const best = prices.length ? Math.min(...prices) : undefined
    const worst = prices.length ? Math.max(...prices) : undefined
    return {
      caseLine,
      bestUnitPrice: best,
      bestRfqId: cells.find((c) => c.effectiveUnitPrice === best)?.rfqId,
      spreadPct: best && worst && prices.length > 1 ? ((worst - best) / best) * 100 : undefined,
      cells: cells.map((c) => ({
        ...c,
        isBest: c.effectiveUnitPrice !== undefined && c.effectiveUnitPrice === best && prices.length > 1,
        isWorst: c.effectiveUnitPrice !== undefined && c.effectiveUnitPrice === worst && prices.length > 1 && worst !== best,
        deltaPct: c.effectiveUnitPrice !== undefined && best ? ((c.effectiveUnitPrice - best) / best) * 100 : undefined,
      })),
    }
  })

  const splitLines: SplitAwardLine[] = lineRows.map((row) => {
    const bestReply = replies.find((r) => r.rfqId === row.bestRfqId)
    const line = bestReply ? lineOf(bestReply, row.caseLine.lineNumber) : undefined
    return { caseLine: row.caseLine, rfqId: bestReply?.rfqId, vendorName: bestReply?.vendorName, netAmount: line?.netAmount ?? 0 }
  })
  const splitTotal = splitLines.reduce((s, l) => s + l.netAmount, 0)
  const fullCoverage = scored.filter((m) => m.coveragePct === 100)
  const single = (fullCoverage.length ? fullCoverage : scored).reduce<ReplyMetrics | undefined>(
    (best, m) => (!best || m.normalizedTotal < best.normalizedTotal ? m : best),
    undefined,
  )

  const targetTotal = caseLines.reduce((s, cl) => s + (cl.targetUnitPrice ?? 0) * cl.quantity, 0)

  return {
    metrics: scored,
    lineRows,
    targetTotal: targetTotal > 0 ? targetTotal : undefined,
    split: {
      lines: splitLines,
      total: splitTotal,
      bestSingleVendorTotal: single?.normalizedTotal ?? 0,
      bestSingleVendor: single?.reply.vendorName,
      savings: single ? single.normalizedTotal - splitTotal : 0,
      vendorsUsed: new Set(splitLines.map((l) => l.rfqId).filter(Boolean)).size,
    },
  }
}

function csvCell(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function comparisonToCsv(rfqCaseId: string, result: ComparisonResult) {
  const rows: unknown[][] = []
  rows.push(["RFQ case", rfqCaseId])
  rows.push([])
  rows.push(["Vendor", "Vendor RFQ", "Rank", "Score", "Total", "Normalised total", "Δ vs lowest %", "Lines quoted", "Max lead time (days)", "Payment terms", "Delivery terms", "Valid until"])
  for (const m of [...result.metrics].sort((a, b) => a.rank - b.rank)) {
    rows.push([
      m.reply.vendorName,
      m.reply.rfqId,
      m.rank,
      m.weighted.toFixed(1),
      m.total.toFixed(2),
      m.normalizedTotal.toFixed(2),
      m.deltaVsLowestPct.toFixed(1),
      `${m.quotedLines}/${m.totalLines}`,
      m.maxLeadTimeDays ?? "",
      m.reply.paymentTerms ?? "",
      m.reply.deliveryTerms ?? "",
      m.reply.validUntil?.slice(0, 10) ?? "",
    ])
  }
  rows.push([])
  rows.push(["Line", "Item", "Description", "Quantity", "Unit", ...result.metrics.map((m) => `${m.reply.vendorName} unit price`), "Best vendor"])
  for (const row of result.lineRows) {
    rows.push([
      row.caseLine.lineNumber,
      row.caseLine.itemNumber,
      row.caseLine.itemName,
      row.caseLine.quantity,
      row.caseLine.unit,
      ...row.cells.map((c) => (c.effectiveUnitPrice !== undefined ? c.effectiveUnitPrice.toFixed(4) : "no quote")),
      result.metrics.find((m) => m.reply.rfqId === row.bestRfqId)?.reply.vendorName ?? "",
    ])
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
}

export function downloadText(fileName: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
