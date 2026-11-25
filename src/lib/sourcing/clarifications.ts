import type { StoredRecord } from "@/data/sourcing-store"

export interface Clarification extends StoredRecord {
  caseId: string
  createdAt: string
  source: "vendor" | "buyer"
  vendorAccount?: string
  vendorName?: string
  question: string
  answer?: string
  answeredAt?: string
  /** Anonymised wording shared with every invited vendor; defaults to the question. */
  publishedQuestion?: string
  publishedAt?: string
  /** Vendor RFQ ids the published answer was e-mailed to. */
  publishedToRfqIds?: string[]
}

export type ClarificationStatus = "open" | "answered" | "published"

export function clarificationStatus(c: Clarification): ClarificationStatus {
  if (c.publishedAt) return "published"
  return c.answer?.trim() ? "answered" : "open"
}

export function newClarification(company: string, caseId: string, source: Clarification["source"], question: string, vendor?: { account: string; name: string }): Clarification {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    company,
    caseId,
    updatedAt: now,
    createdAt: now,
    source,
    vendorAccount: vendor?.account,
    vendorName: vendor?.name,
    question: question.trim(),
  }
}

export function summarizeClarifications(list: Clarification[]) {
  const count = (status: ClarificationStatus) => list.filter((c) => clarificationStatus(c) === status).length
  return { total: list.length, open: count("open"), answered: count("answered"), published: count("published") }
}

/** Q&A broadcast to all invited vendors. The asking vendor is never named. */
export function buildPublishEmail(input: { caseId: string; caseName: string; question: string; answer: string; senderName: string }) {
  return {
    subject: `Clarification – ${input.caseId} ${input.caseName}`,
    message: [
      `A clarification has been issued for "${input.caseName}" (${input.caseId}). It applies to all invited suppliers.`,
      "",
      `Question: ${input.question.trim()}`,
      "",
      `Answer: ${input.answer.trim()}`,
      "",
      "Please take this into account in your quotation.",
      "",
      "Kind regards,",
      input.senderName,
    ].join("\n"),
  }
}

/** Suppliers that should receive published answers: invited and still in the running. */
export function publishRecipientStatuses(status: string) {
  return !["Created", "Removed", "Canceled", "Declined"].includes(status)
}
