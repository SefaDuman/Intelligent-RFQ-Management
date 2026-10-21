import type {
  CurrentUser,
  Invitation,
  InviteRecipient,
  InviteRequest,
  RfqCase,
  RfqCaseDetail,
  RfqReply,
  Vendor,
} from "@/domain/types"

export type DataSourceKind = "sample" | "dataverse"
export type EmailChannel = "outlook" | "simulated"

/** Read/write access to RFQ data, independent of where it comes from. */
export interface RfqRepository {
  readonly kind: DataSourceKind
  listCompanies(): Promise<string[]>
  listRfqCases(company?: string): Promise<RfqCase[]>
  /** Reply headers (vendor RFQs) for all cases, including totals where available. */
  listReplies(company?: string): Promise<RfqReply[]>
  getRfqCase(rfqCaseId: string, company?: string): Promise<RfqCaseDetail | null>
  listVendors(company?: string): Promise<Vendor[]>
  /** Optional hook for providers that track invitation state locally. */
  markInvited?(rfqCaseId: string, recipients: InviteRecipient[]): void
}

/** Stores the history of e-mail invitations the app sent. */
export interface InvitationStore {
  list(rfqCaseId?: string): Promise<Invitation[]>
  add(invitations: Invitation[]): Promise<void>
}

export interface SendResult {
  recipient: string
  ok: boolean
  error?: string
}

export interface EmailService {
  readonly channel: EmailChannel
  send(message: { to: string; subject: string; html: string; cc?: string }): Promise<void>
}

export interface DataContext {
  repository: RfqRepository
  invitations: InvitationStore
  email: EmailService
  getCurrentUser(): Promise<CurrentUser>
  /** Diagnostics shown in the UI (e.g. which generated services were found). */
  diagnostics: string[]
}

export type { InviteRequest }
