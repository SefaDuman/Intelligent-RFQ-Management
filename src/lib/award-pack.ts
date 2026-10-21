import type { RfqCaseDetail, Vendor } from "@/domain/types"
import { buildBriefSnapshot } from "@/lib/comparison-brief"
import { compareReplies, CRITERIA, type Weights } from "@/lib/comparison"
import { evaluateRfqHealth } from "@/lib/rfq-health"

export interface AwardPackInput {
  detail: RfqCaseDetail
  selectedIds: string[]
  vendors: Vendor[]
  weights: Weights
  preferredId: string
  rationale: string
  preparedBy: string
  reviewed: boolean
}

export function awardEvidenceKey(input: AwardPackInput, now: Date) {
  const selected = input.detail.replies.filter((reply) => input.selectedIds.includes(reply.rfqId))
  return JSON.stringify({
    snapshot: buildBriefSnapshot(input.detail, input.selectedIds, input.vendors, input.weights, now.toISOString().slice(0, 10)),
    health: evaluateRfqHealth({ ...input.detail, replies: selected }, now),
    source: { header: input.detail.header, lines: input.detail.lines, replies: selected },
    preferredId: input.preferredId, rationale: input.rationale, preparedBy: input.preparedBy, reviewed: input.reviewed,
  })
}

const escapeHtml = (value: unknown) => String(value ?? "Not supplied").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)

export function buildAwardPack(input: AwardPackInput, now = new Date()) {
  const { detail, selectedIds, vendors, weights, preferredId, rationale, preparedBy } = input
  const snapshot = buildBriefSnapshot(detail, selectedIds, vendors, weights, now.toISOString().slice(0, 10))
  if (!input.reviewed) throw new Error("Review the offers and acknowledge unresolved risks before preparing the pack.")
  if (!rationale.trim() || rationale.length > 5000) throw new Error("Enter a buyer rationale of 1 to 5,000 characters.")
  if (!preparedBy.trim() || preparedBy.length > 200) throw new Error("Enter a preparer name of 1 to 200 characters.")
  if (!selectedIds.includes(preferredId)) throw new Error("Choose a preferred offer from the selected replies.")
  const replies = detail.replies.filter((reply) => selectedIds.includes(reply.rfqId))
  if (new Set(selectedIds).size !== selectedIds.length || replies.length !== selectedIds.length) throw new Error("The reply selection is invalid.")
  if (!["Created", "Sent", "Received"].includes(detail.header.status) || replies.some((reply) => reply.status !== "Received")) {
    throw new Error("Packs require an open RFQ and selected replies with Received status. No award is executed.")
  }
  if (!snapshot.recommendationAllowed) throw new Error(`Resolve comparison blockers first: ${snapshot.warnings.join(" ")}`)
  for (const reply of replies) {
    for (const requested of detail.lines) {
      const matches = reply.lines?.filter((line) => line.lineNumber === requested.lineNumber && line.quoted) ?? []
      if (matches.length !== 1 || matches[0].itemNumber !== requested.itemNumber || matches[0].netAmount <= 0 || requested.quantity <= 0) {
        throw new Error(`Reply ${reply.rfqId}, line ${requested.lineNumber}: resolve duplicate, missing, mismatched or unpriced lines before recommending an award.`)
      }
    }
  }
  const result = compareReplies(detail.lines, replies, vendors, weights)
  const ranked = [...result.metrics].sort((a, b) => a.rank - b.rank)
  const preferred = ranked.find((metric) => metric.reply.rfqId === preferredId)
  if (!preferred) throw new Error("The preferred reply is no longer available.")
  const topScore = Math.max(...ranked.map((metric) => metric.weighted))
  const leaders = ranked.filter((metric) => metric.weighted === topScore)
  const weightSum = CRITERIA.reduce((sum, criterion) => sum + weights[criterion.key], 0)
  const risks = [...new Set([
    ...snapshot.warnings,
    ...evaluateRfqHealth({ ...detail, replies }, now).findings.map((finding) => `${finding.title}: ${finding.evidence}`),
  ])]
  const e = escapeHtml
  const rows = ranked.map((metric) => `<tr><td>${metric.rank}</td><td>${e(metric.reply.vendorName)}<br>${e(metric.reply.vendorAccount)} / ${e(metric.reply.rfqId)}</td><td>${e(metric.reply.currency)} ${metric.total.toFixed(2)}</td><td>${metric.normalizedTotal.toFixed(2)}</td><td>${metric.weighted.toFixed(2)}</td><td>${metric.coveragePct.toFixed(1)}%</td><td>${e(metric.maxLeadTimeDays)}</td><td>${e(metric.reply.paymentTerms)}</td><td>${e(metric.reply.validUntil)}</td></tr>`).join("")
  const scores = CRITERIA.map(({ key, label }) => `<tr><td>${e(label)}</td><td>${weights[key]}</td><td>${(weights[key] / weightSum * 100).toFixed(1)}%</td>${ranked.map((metric) => `<td>${metric.scores[key].toFixed(2)}</td>`).join("")}</tr>`).join("")
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'">
<title>Award recommendation - ${e(detail.header.rfqCaseId)}</title>
<style>body{font:14px/1.6 system-ui,sans-serif;color:#172033;max-width:1150px;margin:32px auto;padding:0 24px}h1,h2{color:#283e8c}h2{margin-top:30px}.banner{padding:16px;border:1px solid #d7a62f;background:#fff8e3;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccd3e0;padding:8px;text-align:left;vertical-align:top}th{background:#eef2ff}.text{white-space:pre-wrap;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7fb;padding:12px;font-size:11px}small{color:#526079}@media print{body{margin:0;max-width:none;padding:0}h2,h3{break-after:avoid}tr,pre{break-inside:avoid}thead{display:table-header-group}}</style></head><body>
<h1>Award recommendation pack</h1>
<div class="banner"><strong>BUYER-REVIEWED RECOMMENDATION — NOT AN APPROVAL OR EXECUTED AWARD</strong><br>No bids accepted/rejected, purchase orders created, emails sent or ERP records changed. Revalidate source data and obtain organizational approvals before acting.</div>
<h2>RFQ and preparation</h2>
<p><strong>${e(detail.header.rfqCaseId)} — ${e(detail.header.name)}</strong><br>Legal entity: ${e(detail.header.company.toUpperCase())} · Currency: ${e(detail.header.currency)}<br>Generated: ${e(now.toISOString())}<br>Prepared by (buyer-entered, not an authenticated signature): ${e(preparedBy.trim())}<br>Scope: ${replies.length} selected replies out of ${detail.replies.length} accessible vendor RFQs. Unselected replies are not evaluated.</p>
<h2>Buyer preference and justification</h2>
<p>Preferred offer: <strong>${e(preferred.reply.vendorName)}</strong>, account ${e(preferred.reply.vendorAccount)}, reply ${e(preferredId)}. Quoted total ${e(preferred.reply.currency)} ${preferred.total.toFixed(2)}.</p>
<p>Top weighted score: ${leaders.map((metric) => e(`${metric.reply.vendorName} (${metric.reply.rfqId})`)).join(", ")}${leaders.length > 1 ? " (tie; display rank does not break the tie)" : ""}. ${preferred.weighted < topScore ? "Buyer selected a lower-scoring offer; the rationale below documents the departure." : "Buyer preference matches a top-scoring offer."}</p>
<p class="text">${e(rationale.trim())}</p>
<h2>Evaluated offers</h2>
<table><thead><tr><th>Display rank</th><th>Vendor / reply</th><th>Quoted total</th><th>Normalized total</th><th>Score</th><th>Coverage</th><th>Max known lead days</th><th>Payment terms</th><th>Validity</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Selection criteria and scores</h2>
<table><thead><tr><th>Criterion</th><th>Raw weight</th><th>Share</th>${ranked.map((metric) => `<th>${e(metric.reply.rfqId)}</th>`).join("")}</tr></thead><tbody>${scores}</tbody></table>
<p>Price uses the existing normalized-total score; delivery uses maximum known line lead time; coverage uses quoted requested lines; terms use parsed net days. Unknown criteria use workspace defaults and are not verified performance. Known lead times are not guaranteed receipt dates. Totals exclude unspecified charges, freight and taxes; no currency conversion is applied. No split award is proposed.</p>
<h2>Unresolved risks and follow-up</h2>
${risks.length ? `<ul>${risks.map((risk) => `<li>${e(risk)}</li>`).join("")}</ul>` : "<p>No configured checks flagged a risk. This is not a compliance certification.</p>"}
<h2>Review and approval status</h2>
<p>The preparer acknowledged reviewing selected offers, rationale and unresolved risks before export. This is a buyer assertion, not an electronic signature. Approval status: <strong>Not requested / not recorded</strong>. No approval history exists for this downloadable memo. Follow the organization's approval process separately.</p>
<h2>Supporting evidence snapshot</h2>
<p>Evidence is frozen at preparation time and may become stale. References below contain the exact facts used for the comparison, including requested quantities, quoted line amounts and terms.</p>
${snapshot.evidence.map((item) => `<section><h3 id="${e(item.id)}">${e(item.id)}: ${e(item.label)}</h3><pre>${e(JSON.stringify(item.facts, null, 2))}</pre></section>`).join("")}
<small>Generated by Intelligent RFQ Management. Deterministic comparison with buyer-written rationale; no AI-generated approval or authority implied. Save this file as part of your organization's records. Open in a browser and print to PDF if required.</small></body></html>`
  return { html, fileName: `RFQ-${detail.header.company}-${detail.header.rfqCaseId}-award-recommendation.html`.replace(/[^a-zA-Z0-9._-]/g, "_"), evidenceKey: awardEvidenceKey(input, now) }
}
