/**
 * Domain model for the RFQ process in Dynamics 365 Finance & Supply Chain.
 * Values here are provider-agnostic: both the sample provider and the
 * Dataverse virtual table (mserp_*) provider map into these shapes.
 */

/** Mirrors the F&SC PurchRFQStatus enum. */
export const RFQ_STATUSES = ["Created", "Sent", "Received", "Accepted", "Rejected", "Canceled", "Declined", "Removed"] as const
export type RfqStatus = (typeof RFQ_STATUSES)[number]

export const OPEN_STATUSES: readonly RfqStatus[] = ["Created", "Sent", "Received"]

export function isOpenStatus(status: RfqStatus) {
  return OPEN_STATUSES.includes(status)
}

/** A vendor RFQ has a reply once it reaches Received or a later decision state. */
export function hasReplied(status: RfqStatus) {
  return status === "Received" || status === "Accepted" || status === "Rejected"
}

export interface Vendor {
  accountNumber: string
  name: string
  email?: string
  vendorGroup?: string
  /** 0 - 5 rating (vendor evaluation) */
  rating?: number
  /** 0 - 100 on-time delivery percentage */
  onTimeDeliveryPct?: number
  city?: string
  country?: string
}

/** RFQ case header (PurchRFQCaseTable). */
export interface RfqCase {
  /** Provider record id (Dataverse primary key for live data). */
  recordId: string
  rfqCaseId: string
  name: string
  status: RfqStatus
  company: string
  currency: string
  procurementCategory?: string
  requester?: string
  createdDate?: string
  /** Reply deadline */
  expiryDate?: string
  requestedDeliveryDate?: string
  deliveryTerms?: string
}

/** RFQ case line (PurchRFQCaseLine). */
export interface RfqCaseLine {
  recordId: string
  rfqCaseId: string
  lineNumber: number
  itemNumber: string
  itemName: string
  quantity: number
  unit: string
  procurementCategory?: string
  requestedDeliveryDate?: string
  /** Reference/target price if available (e.g. last purchase price). */
  targetUnitPrice?: number
}

/** Vendor-specific RFQ and its reply header (PurchRFQTable / PurchRFQReplyTable). */
export interface RfqReply {
  recordId: string
  rfqId: string
  rfqCaseId: string
  vendorAccount: string
  vendorName: string
  status: RfqStatus
  currency: string
  sentDate?: string
  replyDate?: string
  validUntil?: string
  deliveryDate?: string
  paymentTerms?: string
  deliveryTerms?: string
  notes?: string
  totalAmount?: number
  lines?: RfqReplyLine[]
}

export interface RfqReplyLine {
  recordId: string
  rfqId: string
  lineNumber: number
  itemNumber: string
  quantity: number
  unitPrice: number
  discountPct: number
  netAmount: number
  leadTimeDays?: number
  deliveryDate?: string
  /** False when the vendor declined to quote this line. */
  quoted: boolean
}

export interface RfqCaseDetail {
  header: RfqCase
  lines: RfqCaseLine[]
  replies: RfqReply[]
}

export interface Invitation {
  id: string
  company?: string
  rfqCaseId: string
  vendorAccount?: string
  vendorName: string
  email: string
  subject: string
  sentAt: string
  sentBy?: string
  channel: "outlook" | "simulated"
  status: "sent" | "failed"
  error?: string
}

export interface InviteRecipient {
  vendorAccount?: string
  vendorName: string
  email: string
}

export interface InviteRequest {
  rfqCaseId: string
  recipients: InviteRecipient[]
  subject: string
  /** Builds the HTML body for a specific recipient (personalised greeting). */
  buildBody: (recipient: InviteRecipient) => string
  cc?: string
  sentBy?: string
}

export interface CurrentUser {
  fullName: string
  email?: string
}
