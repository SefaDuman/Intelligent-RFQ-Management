import type { InviteRecipient, RfqCase, RfqCaseLine } from "@/domain/types"
import { formatDate, formatNumber } from "./format"

export interface InviteTemplateInput {
  rfq: RfqCase
  lines: RfqCaseLine[]
  message: string
  includeLines: boolean
  senderName: string
  replyBy?: string
}

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function defaultInviteSubject(rfq: RfqCase) {
  return `Request for quotation ${rfq.rfqCaseId} – ${rfq.name}`
}

export function defaultInviteMessage(rfq: RfqCase) {
  return [
    `We invite you to submit a quotation for "${rfq.name}" (${rfq.rfqCaseId}).`,
    "",
    "Please quote unit prices, applicable discounts, lead times and your payment and delivery terms for each line below. Partial quotations are welcome; please indicate lines you cannot supply.",
    "",
    "Reply to this e-mail or submit your bid through the vendor collaboration portal.",
  ].join("\n")
}

/** Builds a self-contained, e-mail-client friendly HTML invitation. */
export function buildInviteHtml(input: InviteTemplateInput, recipient: InviteRecipient) {
  const { rfq, lines, message, includeLines, senderName, replyBy } = input
  const paragraphs = escape(message)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.55">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("")

  const facts = [
    ["RFQ", rfq.rfqCaseId],
    ["Reply by", formatDate(replyBy ?? rfq.expiryDate)],
    ["Requested delivery", formatDate(rfq.requestedDeliveryDate)],
    ["Delivery terms", rfq.deliveryTerms ?? "—"],
    ["Currency", rfq.currency || "—"],
  ]
    .map(
      ([k, v]) =>
        `<td style="padding:8px 14px 8px 0;vertical-align:top"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">${k}</div><div style="font-size:14px;font-weight:600;color:#111827">${escape(v)}</div></td>`,
    )
    .join("")

  const lineTable =
    includeLines && lines.length
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
          <thead><tr style="background:#f3f4f6;text-align:left">
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">#</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Item</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Description</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">Quantity</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Delivery</th>
          </tr></thead>
          <tbody>${lines
            .map(
              (l) => `<tr>
                <td style="padding:8px;border-bottom:1px solid #f0f0f0">${l.lineNumber}</td>
                <td style="padding:8px;border-bottom:1px solid #f0f0f0;font-family:Consolas,monospace">${escape(l.itemNumber)}</td>
                <td style="padding:8px;border-bottom:1px solid #f0f0f0">${escape(l.itemName)}</td>
                <td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">${formatNumber(l.quantity)} ${escape(l.unit)}</td>
                <td style="padding:8px;border-bottom:1px solid #f0f0f0">${formatDate(l.requestedDeliveryDate)}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>`
      : ""

  return `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;max-width:680px">
    <div style="border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:linear-gradient(135deg,#4338ca,#2563eb);padding:20px 24px;color:#fff">
        <div style="font-size:12px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Request for quotation · ${escape(rfq.company)}</div>
        <div style="font-size:20px;font-weight:600;margin-top:4px">${escape(rfq.name)}</div>
      </div>
      <div style="padding:20px 24px">
        <p style="margin:0 0 12px">Dear ${escape(recipient.vendorName)} team,</p>
        ${paragraphs}
        <table role="presentation" style="margin:8px 0 4px"><tr>${facts}</tr></table>
        ${lineTable}
        <p style="margin:16px 0 0">Kind regards,<br/><strong>${escape(senderName)}</strong><br/><span style="color:#6b7280">Procurement</span></p>
      </div>
    </div>
    <p style="font-size:11px;color:#9ca3af;margin-top:10px">Reference ${escape(rfq.rfqCaseId)}${recipient.vendorAccount ? ` · Vendor ${escape(recipient.vendorAccount)}` : ""}</p>
  </div>`
}
