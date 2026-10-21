import type { DataContext, RfqRepository } from "@/data/types"
import { MicrosoftCopilotStudioService } from "@/generated/services/MicrosoftCopilotStudioService"
import { copilotResponseText } from "@/data/copilot-response"
import type { AgentExecutor } from "@/data/comparison-advisor"
import { defaultFollowupDraft, followupCandidates, followupDays, followupHtml, followupPrompt, validFollowupEmail, validateFollowupDraft, type FollowupCandidate, type FollowupDraft } from "@/lib/vendor-followup"

export interface FollowupAttempt {
  id: string
  company: string
  caseId: string
  rfqId: string
  vendorAccount: string
  email: string
  subject: string
  at: string
  status: "pending" | "sent" | "unknown"
}
const KEY = "rfq-followup-attempts:v1"
const DAY = 24 * 60 * 60 * 1000

export class FollowupJournal {
  private storage: Pick<Storage, "getItem" | "setItem">
  constructor(storage: Pick<Storage, "getItem" | "setItem"> = localStorage) { this.storage = storage }
  list(): FollowupAttempt[] {
    const raw = this.storage.getItem(KEY)
    if (!raw) return []
    const records: unknown = JSON.parse(raw)
    if (!Array.isArray(records) || !records.every((record: unknown) => {
      if (!record || typeof record !== "object") return false
      return ["id", "company", "caseId", "rfqId", "vendorAccount", "email", "subject", "at"].every((key) => typeof Reflect.get(record, key) === "string") &&
        Number.isFinite(Date.parse(Reflect.get(record, "at"))) && ["pending", "sent", "unknown"].includes(Reflect.get(record, "status"))
    })) throw new Error("Follow-up history is invalid. Sending is blocked; check browser storage before proceeding.")
    return records
  }
  save(records: FollowupAttempt[]) {
    this.storage.setItem(KEY, JSON.stringify(records))
    if (this.storage.getItem(KEY) !== JSON.stringify(records)) throw new Error("Follow-up history could not be persisted. Sending is blocked.")
  }
}

export function followupBlock(candidate: FollowupCandidate, attempts: FollowupAttempt[], now = new Date()) {
  const same = attempts.filter((attempt) => attempt.company.toLowerCase() === candidate.company.toLowerCase() &&
    attempt.caseId === candidate.caseId && attempt.rfqId === candidate.rfqId && attempt.vendorAccount === candidate.vendorAccount)
  if (same.some((attempt) => attempt.status !== "sent")) return "Delivery is pending or uncertain. Check Outlook Sent Items and reconcile the browser history before any retry; do not clear history to retry."
  const recent = same.find((attempt) => now.getTime() - Date.parse(attempt.at) < DAY)
  return recent ? `A reminder was sent within the 24-hour guard period (${new Date(recent.at).toLocaleString()}).` : undefined
}

export async function scanFollowups(repository: RfqRepository, company: string, signal?: AbortSignal) {
  if (!company) throw new Error("Select a legal entity before scanning.")
  const now = new Date()
  const [cases, vendors] = await Promise.all([repository.listRfqCases(company), repository.listVendors(company)])
  signal?.throwIfAborted()
  if (cases.some((header) => header.company.toLowerCase() !== company.toLowerCase())) throw new Error("RFQ scan returned another company's data.")
  const eligible = cases.filter((header) => { const days = followupDays(header, now); return days !== undefined && days <= 7 })
  const candidates: FollowupCandidate[] = []
  const errors: { caseId: string; message: string }[] = []
  for (let offset = 0; offset < eligible.length; offset += 4) {
    signal?.throwIfAborted()
    await Promise.all(eligible.slice(offset, offset + 4).map(async (header) => {
      try {
        const detail = await repository.getRfqCase(header.rfqCaseId, company)
        if (!detail || detail.header.rfqCaseId !== header.rfqCaseId) throw new Error("RFQ is no longer accessible.")
        candidates.push(...followupCandidates(detail, vendors, company, now))
      } catch (cause) { errors.push({ caseId: header.rfqCaseId, message: cause instanceof Error ? cause.message : String(cause) }) }
    }))
  }
  signal?.throwIfAborted()
  return { candidates: candidates.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.caseId.localeCompare(b.caseId)), errors, checked: eligible.length - errors.length, total: eligible.length, checkedAt: now.toISOString(), unknownDeadlines: cases.filter((header) => ["Created", "Sent", "Received"].includes(header.status) && followupDays(header, now) === undefined).length }
}

export async function draftFollowup(candidate: FollowupCandidate, execute: AgentExecutor = (agent, body) => MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(agent, body)) {
  const result = await execute("rfq_vendorFollowup", { message: followupPrompt(candidate), notificationUrl: "https://notificationurlplaceholder" })
  if (!result.success) throw new Error(result.error instanceof Error ? result.error.message : "The follow-up drafting agent failed. Check its connection and permissions.")
  let value: unknown
  try { value = JSON.parse(copilotResponseText(result.data)) } catch { throw new Error("The follow-up agent did not return valid draft JSON. Retry or use the standard draft.") }
  return validateFollowupDraft(value)
}

// All tabs in this browser origin share the lock and journal; neither is a cross-user audit store.
export async function sendApprovedFollowup(ctx: DataContext, candidate: FollowupCandidate, draft: FollowupDraft, approved: boolean, journal = new FollowupJournal(), locks: Pick<LockManager, "request"> | null | undefined = navigator.locks) {
  if (!approved) throw new Error("Review and explicitly approve this reminder before sending.")
  const content = validateFollowupDraft(draft)
  if (ctx.email.channel !== "outlook") throw new Error("A live Outlook connection is required. Simulated sending is disabled for follow-ups.")
  if (!locks) throw new Error("This browser does not support the cross-tab sending guard. Use a supported secure browser.")
  return locks.request("rfq-vendor-followup-send", { mode: "exclusive" }, async () => {
    const blocked = followupBlock(candidate, journal.list())
    if (blocked) throw new Error(blocked)
    const [detail, vendors] = await Promise.all([ctx.repository.getRfqCase(candidate.caseId, candidate.company), ctx.repository.listVendors(candidate.company)])
    if (!detail || detail.header.rfqCaseId !== candidate.caseId) throw new Error("RFQ is no longer accessible. Scan again.")
    const current = followupCandidates(detail, vendors, candidate.company).filter((item) => item.rfqId === candidate.rfqId && item.vendorAccount === candidate.vendorAccount)
    if (current.length !== 1 || current[0].sourceKey !== candidate.sourceKey) throw new Error("RFQ status, deadline or recipient changed. Scan again and review a new draft.")
    if (!validFollowupEmail(current[0].email)) throw new Error("The vendor needs one valid email address in the current company vendor directory.")
    const records = journal.list()
    const blockedNow = followupBlock(candidate, records)
    if (blockedNow) throw new Error(blockedNow)
    const attempt: FollowupAttempt = { id: crypto.randomUUID(), company: candidate.company, caseId: candidate.caseId, rfqId: candidate.rfqId, vendorAccount: candidate.vendorAccount, email: current[0].email, subject: content.subject, at: new Date().toISOString(), status: "pending" }
    journal.save([attempt, ...records])
    try {
      await ctx.email.send({ to: current[0].email, subject: content.subject, html: followupHtml(content.message) })
    } catch (cause) {
      attempt.status = "unknown"
      journal.save([attempt, ...records])
      throw new Error(`Outlook delivery is uncertain. Do not retry until Sent Items are checked. ${cause instanceof Error ? cause.message : String(cause)}`)
    }
    attempt.status = "sent"
    attempt.at = new Date().toISOString()
    try { journal.save([attempt, ...records]) } catch {
      throw new Error("Outlook accepted the email, but history could not be finalized. The pending record blocks retries; check Sent Items.")
    }
    return attempt
  })
}

export { defaultFollowupDraft }
