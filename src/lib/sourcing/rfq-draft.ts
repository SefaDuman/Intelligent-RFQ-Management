import { addDays, addMonths, addWeeks, endOfMonth, format, isValid, parseISO, startOfDay } from "date-fns"
import type { StoredRecord } from "@/data/sourcing-store"
import { DEFAULT_CRITERIA, criteriaWeightTotal, type EvalCriterion } from "./evaluation"

export type EventType = "RFQ" | "RFP" | "RFI"

export interface DraftLine {
  id: string
  itemName: string
  quantity: number
  unit: string
  targetUnitPrice?: number
}

export interface DraftSupplier {
  accountNumber: string
  name: string
  email?: string
}

export interface RfqDraft extends StoredRecord {
  title: string
  eventType: EventType
  templateId: string
  category?: string
  currency: string
  replyByDate?: string
  requestedDeliveryDate?: string
  deliveryTerms?: string
  paymentTerms?: string
  justification?: string
  requirementText: string
  lines: DraftLine[]
  criteria: EvalCriterion[]
  /** Share of the combined score from the technical evaluation (0 - 100). */
  technicalWeightPct: number
  shortlist: DraftSupplier[]
}

export interface EventTemplate {
  id: string
  label: string
  eventType: EventType
  description: string
  replyDays: number
  paymentTerms: string
  deliveryTerms?: string
  technicalWeightPct: number
  criteria: EvalCriterion[]
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "goods-rfq",
    label: "Goods RFQ",
    eventType: "RFQ",
    description: "Standard items where price, lead time and specification compliance decide.",
    replyDays: 10,
    paymentTerms: "Net 30",
    deliveryTerms: "DAP",
    technicalWeightPct: 20,
    criteria: [
      { id: "spec", label: "Specification compliance", description: "Offered item meets the requested specification", weight: 50, mustPass: true },
      { id: "delivery-reliability", label: "Delivery reliability", description: "Stock position and on-time record", weight: 30 },
      { id: "warranty", label: "Warranty & after-sales", description: "Warranty period, returns and support", weight: 20 },
    ],
  },
  {
    id: "services-rfp",
    label: "Services RFP",
    eventType: "RFP",
    description: "Services where approach, capability and references matter alongside price.",
    replyDays: 21,
    paymentTerms: "Net 45",
    technicalWeightPct: 40,
    criteria: DEFAULT_CRITERIA,
  },
  {
    id: "software-rfp",
    label: "Software / SaaS RFP",
    eventType: "RFP",
    description: "Software and cloud services with security, integration and support requirements.",
    replyDays: 21,
    paymentTerms: "Net 30",
    technicalWeightPct: 50,
    criteria: [
      { id: "functional-fit", label: "Functional fit", description: "Coverage of required capabilities", weight: 30, mustPass: true },
      { id: "security", label: "Security & data protection", description: "Certifications, GDPR, data residency", weight: 25, mustPass: true },
      { id: "integration", label: "Integration & architecture", description: "APIs, SSO, fit with the Microsoft landscape", weight: 20 },
      { id: "support-sla", label: "Support & SLA", description: "Availability, support hours and remedies", weight: 15 },
      { id: "roadmap", label: "Roadmap & references", description: "Product direction and comparable customers", weight: 10 },
    ],
  },
  {
    id: "rfi",
    label: "Request for information",
    eventType: "RFI",
    description: "Market exploration: capabilities and experience, no price commitment.",
    replyDays: 14,
    paymentTerms: "",
    technicalWeightPct: 100,
    criteria: [
      { id: "capability", label: "Capability", description: "Ability to deliver the described scope", weight: 50 },
      { id: "experience", label: "Experience", description: "Comparable work and customers", weight: 30 },
      { id: "commercial-model", label: "Commercial model", description: "Indicative pricing approach", weight: 20 },
    ],
  },
]

export const templateById = (id: string) => EVENT_TEMPLATES.find((t) => t.id === id) ?? EVENT_TEMPLATES[0]

export function newDraft(company: string, currency: string, template: EventTemplate = EVENT_TEMPLATES[0], today = new Date()): RfqDraft {
  return {
    id: crypto.randomUUID(),
    company,
    updatedAt: new Date().toISOString(),
    title: "",
    eventType: template.eventType,
    templateId: template.id,
    currency,
    replyByDate: format(addDays(startOfDay(today), template.replyDays), "yyyy-MM-dd"),
    paymentTerms: template.paymentTerms,
    deliveryTerms: template.deliveryTerms,
    requirementText: "",
    lines: [],
    criteria: template.criteria.map((c) => ({ ...c })),
    technicalWeightPct: template.technicalWeightPct,
    shortlist: [],
  }
}

/* ---------- Requirement text parsing ---------- */

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
const MONTH_INDEX = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const DATE_EXPR = `\\d{4}-\\d{2}-\\d{2}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\.?(?:,?\\s+\\d{4})?|(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|(?:${MONTHS})\\.?(?:\\s+\\d{4})?`
const REPLY_KEYS = "reply|respond|response|responses|quote|quotes|quotation|quotations|bid|bids|offer|offers"
const DATE_PHRASE = new RegExp(
  `\\b(?:(?:deliver(?:y|ed)?|needed|required|ship(?:ped)?)\\s+)?(?:(${REPLY_KEYS})\\s+)?(?:due(?:\\s+by)?|by|before|until|no later than|on)\\s+(${DATE_EXPR})|\\b(?:(${REPLY_KEYS})\\s+)?(?:within|in)\\s+(\\d+)\\s+(day|week|month)s?\\b`,
  "gi",
)

function monthFromText(text: string) {
  const index = MONTH_INDEX.indexOf(text.slice(0, 3).toLowerCase())
  return index >= 0 ? index : undefined
}

function resolveDate(expr: string, today: Date): string | undefined {
  const iso = expr.match(/^\d{4}-\d{2}-\d{2}$/)
  if (iso) {
    const d = parseISO(expr)
    return isValid(d) && format(d, "yyyy-MM-dd") === expr ? expr : undefined
  }
  const monthName = expr.match(new RegExp(MONTHS, "i"))?.[0]
  const month = monthName ? monthFromText(monthName) : undefined
  if (month === undefined) return undefined
  const numbers = expr.replace(new RegExp(MONTHS, "gi"), " ").match(/\d+/g)?.map(Number) ?? []
  const explicitYear = numbers.find((n) => n >= 1000)
  const day = numbers.find((n) => n >= 1 && n <= 31)
  const build = (year: number) => (day ? new Date(year, month, day) : endOfMonth(new Date(year, month, 1)))
  let date = build(explicitYear ?? today.getFullYear())
  if (!explicitYear && date < startOfDay(today)) date = build(today.getFullYear() + 1)
  if (day && date.getMonth() !== month) return undefined
  return format(date, "yyyy-MM-dd")
}

export interface ParsedDates {
  replyByDate?: string
  requestedDeliveryDate?: string
  /** The text with date phrases removed, so they are not mistaken for line items. */
  remaining: string
}

export function extractDates(text: string, today = new Date()): ParsedDates {
  const result: ParsedDates = { remaining: text }
  for (const match of text.matchAll(DATE_PHRASE)) {
    const isReply = !!(match[1] || match[3])
    let iso: string | undefined
    if (match[2]) iso = resolveDate(match[2], today)
    else if (match[4]) {
      const n = Number(match[4])
      const unit = match[5].toLowerCase()
      iso = format(unit === "day" ? addDays(today, n) : unit === "week" ? addWeeks(today, n) : addMonths(today, n), "yyyy-MM-dd")
    }
    if (!iso) continue
    if (isReply) result.replyByDate ??= iso
    else result.requestedDeliveryDate ??= iso
    result.remaining = result.remaining.replace(match[0], " ")
  }
  return result
}

const UNIT_ALIASES: Record<string, string> = {
  pcs: "pcs", pc: "pcs", piece: "pcs", pieces: "pcs", unit: "pcs", units: "pcs", ea: "pcs", each: "pcs",
  license: "licenses", licenses: "licenses", licence: "licenses", licences: "licenses",
  seat: "seats", seats: "seats", user: "users", users: "users",
  hour: "hours", hours: "hours", hrs: "hours", day: "days", days: "days", month: "months", months: "months",
  kg: "kg", g: "g", t: "t", m: "m", l: "l", box: "boxes", boxes: "boxes", set: "sets", sets: "sets",
}
const UNIT_WORD = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length).join("|")

export function parseNumber(text: string): number | undefined {
  let t = text.replace(/\s/g, "")
  const comma = t.lastIndexOf(",")
  const dot = t.lastIndexOf(".")
  if (comma >= 0 && dot >= 0) t = comma > dot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")
  else if (comma >= 0) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".")
  else if (/^\d{1,3}(\.\d{3}){2,}$/.test(t)) t = t.replace(/\./g, "")
  const value = Number(t)
  return Number.isFinite(value) ? value : undefined
}

const CURRENCY_SYMBOLS: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" }
const CURRENCY_CODES = /\b(USD|EUR|GBP|CHF|PLN|HRK|RON|CZK|HUF|TRY|AED|SEK|NOK|DKK)\b/i
const PRICE = /(?:@|target(?:\s+price)?\s*[:=]?|at)\s*([$€£])?\s*(\d[\d.,]*)(?:\s*(?:each|per\s+\w+|\/\w+|ea))?/i

function lineId(index: number) {
  return `line-${index + 1}`
}

function parseItemLine(raw: string): Omit<DraftLine, "id"> & { currency?: string } | undefined {
  let text = raw.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim()
  if (!text) return undefined
  let targetUnitPrice: number | undefined
  let currency: string | undefined
  const price = text.match(PRICE)
  if (price) {
    targetUnitPrice = parseNumber(price[2])
    currency = price[1] ? CURRENCY_SYMBOLS[price[1]] : undefined
    text = text.replace(price[0], " ").replace(/\s+/g, " ").trim()
  }
  const qtyFirst = text.match(new RegExp(`^(\\d[\\d.,]*)\\s*(?:x|×)?\\s*(${UNIT_WORD})?\\b\\s*(?:of\\s+)?(.*\\S)$`, "i"))
  if (qtyFirst) {
    const quantity = parseNumber(qtyFirst[1])
    const unit = qtyFirst[2]?.toLowerCase()
    const name = qtyFirst[3].replace(/[.;,]+$/, "").trim()
    const looksLikeYear = quantity !== undefined && quantity >= 1900 && quantity <= 2100 && !unit
    if (quantity && quantity > 0 && name && !looksLikeYear) {
      return { itemName: name, quantity, unit: unit ? UNIT_ALIASES[unit] : "pcs", targetUnitPrice, currency }
    }
  }
  const itemFirst = text.match(new RegExp(`^(.*?\\S)\\s*(?:[-–—:,]|\\bx|×)\\s*(\\d[\\d.,]*)\\s*(${UNIT_WORD})?\\b[.;]?$`, "i"))
  if (itemFirst) {
    const quantity = parseNumber(itemFirst[2])
    if (quantity && quantity > 0) {
      const unit = itemFirst[3]?.toLowerCase()
      return { itemName: itemFirst[1].trim(), quantity, unit: unit ? UNIT_ALIASES[unit] : "pcs", targetUnitPrice, currency }
    }
  }
  return undefined
}

export interface ParsedRequirement {
  title: string
  lines: DraftLine[]
  category?: string
  currency?: string
  replyByDate?: string
  requestedDeliveryDate?: string
  justification?: string
  warnings: string[]
}

/** Turns a free-text requirement into a first RFQ draft. Deterministic: the buyer reviews and corrects everything. */
export function parseRequirement(text: string, options: { today?: Date; categories?: string[]; defaultCurrency?: string } = {}): ParsedRequirement {
  const today = options.today ?? new Date()
  const warnings: string[] = []
  const dates = extractDates(text, today)
  const working = dates.remaining.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  const lines: DraftLine[] = []
  const narrative: string[] = []
  let currency: string | undefined
  const push = (item: NonNullable<ReturnType<typeof parseItemLine>>) => {
    currency ??= item.currency
    lines.push({ id: lineId(lines.length), itemName: item.itemName, quantity: item.quantity, unit: item.unit, targetUnitPrice: item.targetUnitPrice })
  }
  for (const line of working) {
    const item = parseItemLine(line)
    if (item) push(item)
    else narrative.push(line)
  }

  // A single sentence such as "We need 20 laptops for new hires": pull out the quantity phrase.
  if (!lines.length) {
    const inline = dates.remaining.match(
      new RegExp(`\\b(\\d[\\d.,]*)\\s*(?:x|×)?\\s*(${UNIT_WORD})?\\b\\s*(?:of\\s+)?([A-Za-z][\\w\\- ]*?)(?=\\s+(?:for|in|to|at|from|with|on|within|by|before)\\b|[.,;\\n]|$)`, "i"),
    )
    const quantity = inline ? parseNumber(inline[1]) : undefined
    const name = inline?.[3]?.trim()
    if (inline && quantity && quantity > 0 && name && !new RegExp(`^(${MONTHS})\\b`, "i").test(name)) {
      push({ itemName: name, quantity, unit: inline[2] ? UNIT_ALIASES[inline[2].toLowerCase()] : "pcs" })
    }
  }

  const symbol = text.match(/[$€£]/)?.[0]
  currency ??= symbol ? CURRENCY_SYMBOLS[symbol] : text.match(CURRENCY_CODES)?.[1]?.toUpperCase()

  const category = [...(options.categories ?? [])].sort((a, b) => b.length - a.length).find((c) => c && text.toLowerCase().includes(c.toLowerCase()))
  const firstNarrative = narrative[0]
  const title = firstNarrative && working.length > 1 && firstNarrative.length <= 90
    ? firstNarrative.replace(/[.:]+$/, "")
    : lines[0]
      ? `${lines[0].itemName.charAt(0).toUpperCase()}${lines[0].itemName.slice(1)}`
      : ""

  if (!lines.length) warnings.push("No line items found. Use one item per line, for example “20 x Laptop @ 1200”, or add lines manually.")
  if (lines.some((l) => l.targetUnitPrice === undefined)) warnings.push("Some lines have no target price, so savings will be measured against the average bid.")
  if (!dates.requestedDeliveryDate) warnings.push("No delivery date found. Add one before inviting suppliers.")
  if (!category && options.categories?.length) warnings.push("No known procurement category recognised. Select one to improve supplier suggestions.")

  return {
    title,
    lines,
    category,
    currency: currency ?? options.defaultCurrency,
    replyByDate: dates.replyByDate,
    requestedDeliveryDate: dates.requestedDeliveryDate,
    justification: narrative.filter((n) => n !== title).join(" ") || undefined,
    warnings,
  }
}

/* ---------- Validation and export ---------- */

export interface DraftIssue {
  level: "error" | "warning"
  field: string
  message: string
}

export function validateDraft(draft: RfqDraft, today = new Date()): DraftIssue[] {
  const issues: DraftIssue[] = []
  const error = (field: string, message: string) => issues.push({ level: "error", field, message })
  const warn = (field: string, message: string) => issues.push({ level: "warning", field, message })
  const startToday = startOfDay(today)

  if (!draft.title.trim()) error("title", "Give the event a title.")
  if (!draft.currency.trim()) error("currency", "Select a currency.")
  if (!draft.lines.length) error("lines", "Add at least one line.")
  draft.lines.forEach((l, i) => {
    if (!l.itemName.trim()) error("lines", `Line ${i + 1} needs an item name.`)
    if (!(l.quantity > 0)) error("lines", `Line ${i + 1} needs a quantity above zero.`)
  })
  const names = draft.lines.map((l) => l.itemName.trim().toLowerCase()).filter(Boolean)
  if (new Set(names).size < names.length) warn("lines", "Some lines have the same item name.")

  const reply = draft.replyByDate ? parseISO(draft.replyByDate) : undefined
  const delivery = draft.requestedDeliveryDate ? parseISO(draft.requestedDeliveryDate) : undefined
  if (!reply || !isValid(reply)) error("replyByDate", "Set a reply-by date.")
  else if (reply < startToday) error("replyByDate", "The reply-by date is in the past.")
  if (delivery && isValid(delivery) && reply && isValid(reply) && delivery < reply) warn("requestedDeliveryDate", "Requested delivery is before the reply-by date.")
  if (!delivery) warn("requestedDeliveryDate", "No requested delivery date.")
  if (!draft.category) warn("category", "No procurement category selected.")

  if (draft.criteria.length) {
    if (Math.round(criteriaWeightTotal(draft.criteria)) !== 100) warn("criteria", `Evaluation criteria weights total ${Math.round(criteriaWeightTotal(draft.criteria))}, not 100.`)
  } else if (draft.eventType !== "RFQ") {
    warn("criteria", "RFP and RFI events normally need evaluation criteria.")
  }
  if (draft.shortlist.length === 0) warn("shortlist", "No suppliers shortlisted yet.")
  else if (draft.shortlist.length < 3 && draft.eventType !== "RFI") warn("shortlist", "A competitive event normally needs at least three suppliers.")
  draft.shortlist.filter((s) => !s.email).forEach((s) => warn("shortlist", `${s.name} has no e-mail address.`))
  return issues
}

export const DRAFT_PACKAGE_NOTICE = "Staging package for buyer review. It has not been created in Dynamics 365 and no suppliers were contacted."

export function buildDraftPackage(draft: RfqDraft, now = new Date()) {
  return {
    schema: "rfq-draft-package/v1",
    generatedAt: now.toISOString(),
    notice: DRAFT_PACKAGE_NOTICE,
    company: draft.company,
    event: {
      type: draft.eventType,
      template: draft.templateId,
      title: draft.title.trim(),
      procurementCategory: draft.category ?? null,
      currency: draft.currency,
      replyByDate: draft.replyByDate ?? null,
      requestedDeliveryDate: draft.requestedDeliveryDate ?? null,
      deliveryTerms: draft.deliveryTerms ?? null,
      paymentTerms: draft.paymentTerms ?? null,
      justification: draft.justification ?? null,
    },
    lines: draft.lines.map((l, i) => ({ lineNumber: i + 1, itemName: l.itemName.trim(), quantity: l.quantity, unit: l.unit, targetUnitPrice: l.targetUnitPrice ?? null })),
    evaluation: { technicalWeightPct: draft.technicalWeightPct, criteria: draft.criteria },
    suppliers: draft.shortlist.map((s) => ({ accountNumber: s.accountNumber, name: s.name, email: s.email ?? null })),
    requirementText: draft.requirementText,
  }
}
