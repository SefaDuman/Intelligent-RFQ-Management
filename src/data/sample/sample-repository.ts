import { formatISO } from "date-fns"
import type { InviteRecipient, RfqCase, RfqCaseDetail, RfqReply, Vendor } from "@/domain/types"
import type { RfqRepository } from "@/data/types"
import { generateSampleData, type SampleDataset } from "./sample-data"

const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = <T,>(value: T): T => structuredClone(value)

/** In-memory repository backed by deterministic sample data. */
export class SampleRepository implements RfqRepository {
  readonly kind = "sample" as const
  private data: SampleDataset

  constructor(data: SampleDataset = generateSampleData()) {
    this.data = data
  }

  get seedInvitations() {
    return this.data.invitations
  }

  async listCompanies(): Promise<string[]> {
    return [...new Set(this.data.cases.map((c) => c.company.toLowerCase()))].sort()
  }

  async listRfqCases(): Promise<RfqCase[]> {
    await delay()
    return clone(this.data.cases)
  }

  async listReplies(): Promise<RfqReply[]> {
    await delay()
    return clone(this.data.replies.map((r) => ({ ...r, lines: undefined })))
  }

  async getRfqCase(rfqCaseId: string): Promise<RfqCaseDetail | null> {
    await delay()
    const header = this.data.cases.find((c) => c.rfqCaseId === rfqCaseId)
    if (!header) return null
    return clone({
      header,
      lines: this.data.caseLines.filter((l) => l.rfqCaseId === rfqCaseId),
      replies: this.data.replies.filter((r) => r.rfqCaseId === rfqCaseId),
    })
  }

  async listVendors(): Promise<Vendor[]> {
    await delay(150)
    return clone(this.data.vendors)
  }

  /**
   * Simulates F&SC behaviour after invitations are sent: vendors get a vendor
   * RFQ in status "Sent" and the case moves out of "Created".
   */
  markInvited(rfqCaseId: string, recipients: InviteRecipient[]) {
    const header = this.data.cases.find((c) => c.rfqCaseId === rfqCaseId)
    if (!header) return
    const now = formatISO(new Date())
    for (const recipient of recipients) {
      const existing = this.data.replies.find(
        (r) => r.rfqCaseId === rfqCaseId && r.vendorAccount && r.vendorAccount === recipient.vendorAccount,
      )
      if (existing) {
        if (existing.status === "Created") {
          existing.status = "Sent"
          existing.sentDate = now
        }
        continue
      }
      if (!recipient.vendorAccount) continue
      const rfqId = `RFQ-${String(9000 + this.data.replies.length).padStart(6, "0")}`
      this.data.replies.push({
        recordId: rfqId,
        rfqId,
        rfqCaseId,
        vendorAccount: recipient.vendorAccount,
        vendorName: recipient.vendorName,
        status: "Sent",
        currency: header.currency,
        sentDate: now,
        lines: [],
      })
    }
    if (header.status === "Created") header.status = "Sent"
  }
}
