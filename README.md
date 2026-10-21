# Intelligent RFQ Management

A Power Apps **code app** (Vite + React + TypeScript) for managing the request for quotation (RFQ) process in **Dynamics 365 Finance & Supply Chain Management**. F&SC data is read through **Dataverse virtual tables** (`mserp_*`), and vendor invitations are sent through the **Office 365 Outlook** connector.

## Features

| Area | What you get |
| --- | --- |
| **Overview** | KPIs (open RFQs, awaiting replies, ready to compare, due soon, response rate, open quoted value), open RFQ pipeline with reply progress, status mix, 6-month sourcing activity, upcoming deadlines, vendor responsiveness, value by category and recent invitations |
| **Requests for quotation** | Searchable and filterable list (status, category, sort) with reply progress, best quote and deadline |
| **RFQ detail** | Header facts, vendor replies, lines with target vs. best price, reply progress, quote range and invitation history |
| **Vendor invitations** | Two-step wizard: pick vendors (category matches are suggested, already-invited vendors are flagged) or add ad-hoc contacts, then edit the subject, message and reply-by date with a live HTML preview. Each vendor gets a personalised e-mail. |
| **Reply comparison workspace** | Select 2–6 replies, see a recommended award, ranked offer cards (score ring, total, Δ vs. lowest, lead time, terms, validity, badges), a line-by-line price matrix with heatmap, a score radar and breakdown, price-index charts and a split-award (cherry-pick) analysis. Adjustable scoring weights with presets, CSV export and a copyable summary. The selection is kept in the URL. |
| **AI comparison brief** | Analyze selected replies with a dedicated Copilot Studio agent. Executive summary, trade-offs, exceptions and a conditional recommendation include expandable source facts. Data-quality checks, stale-analysis detection and copy-with-evidence support buyer review. |
| **RFQ health monitoring** | Overview attention queue with severity filters, search, source evidence and RFQ/compare actions. Checks deadlines, near-deadline response coverage, incomplete offers and comparable price spreads. Findings also appear on open RFQ detail pages. |
| **Award recommendation pack** | Downloadable buyer-reviewed HTML memo with preferred offer, buyer rationale, evaluated bids, weighted criteria, risks and evidence. Current RFQ data is rechecked before preparing and downloading. No approval or award is executed. |
| **Natural-language RFQ assistant** | Dedicated read-only Copilot Studio agent answers company-scoped questions about RFQs, deadlines, replies and quoted line facts, with expandable evidence and RFQ/comparison links. |
| **Vendor follow-up agent** | On-demand queue for outstanding Sent vendor RFQs due within seven days or overdue. Standard or AI-drafted reminders, editable preview, explicit single-email buyer approval, fresh source checks and a 24-hour browser-local sending guard. |
| **Quote-document extraction** | Read text-based PDFs or pasted quote text, extract evidence-backed fields using a dedicated agent, correct values, map quoted rows to RFQ lines and download a buyer-reviewed JSON staging package. No ERP writes or official comparison changes. |

## Getting started

```bash
npm install
pa app run         # open the authenticated "Local Play" URL
npm test           # Dataverse mapping, company isolation and price tests
```

The app now defaults to real Dataverse data in Frontier. Select a legal entity in the header to load that company's RFQs, replies and vendors; switching company resets the workspace and uses separate query caches. The dropdown lists legal entities with accessible RFQ headers. F&O record access remains subject to the signed-in user's permissions.

For a standalone demo, set `VITE_RFQ_DATA_MODE=sample` in `.env.local` and run `npm run dev`. Live mode never silently falls back to sample data.

## Connect to Dynamics 365 Finance & Supply Chain

Prerequisites: code apps enabled in the environment, Dataverse linked to F&SC with [virtual entities](https://learn.microsoft.com/dynamics365/fin-ops-core/dev-itpro/power-platform/virtual-entities-overview) configured, and the [Power Apps CLI](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli).

1. **Initialise the code app**

   ```bash
   npm install --global @microsoft/power-apps-cli
   pa app init --display-name "Intelligent RFQ Management" --environment-id <environment-id>
   ```

2. **Ensure the F&SC entities are generated as virtual tables.** These custom VRM entities already exist in Frontier, and their generated services are included in this project:

   | Purpose | Default logical name |
   | --- | --- |
   | Vendor RFQ headers, grouped into cases | `mserp_vrmrequestforquotationheaderentity` |
   | Requested lines, deduplicated by case line | `mserp_vrmrequestforquotationlineentity` |
   | Vendor RFQ / reply header | `mserp_vrmrequestforquotationreplyheaderentity` |
   | Reply lines | `mserp_vrmrequestforquotationreplylineentity` |
   | Vendors | `mserp_vendvendorv2entity` |

3. **For another environment, verify its schema.** The mappings in [src/config/dataverse-schema.ts](src/config/dataverse-schema.ts) were checked against Frontier's actual generated metadata on October 9, 2026. Optional fields absent from these entities are `null`. VRM entities are custom, not standard entities guaranteed to exist in every F&O environment.

4. **Add the tables as data sources**. This generates typed services in `src/generated/services`:

   ```bash
   pa app add data-source --connector dataverse --table mserp_vrmrequestforquotationheaderentity
   pa app add data-source --connector dataverse --table mserp_vrmrequestforquotationlineentity
   pa app add data-source --connector dataverse --table mserp_vrmrequestforquotationreplyheaderentity
   pa app add data-source --connector dataverse --table mserp_vrmrequestforquotationreplylineentity
   pa app add data-source --connector dataverse --table mserp_vendvendorv2entity
   ```

5. **Add Office 365 Outlook** to send real invitations (otherwise sending is simulated):

   ```bash
   pa connection create            # choose Office 365 Outlook, note the connection id
   pa app add data-source --connector shared_office365 --connection-id <connection-id>
   ```

6. **Optional settings.** Copy `.env.example` to `.env.local` to preselect a legal entity (`VITE_FNO_COMPANY`), enable *Open in F&SC* links (`VITE_FNO_URL`) or explicitly use sample mode (`VITE_RFQ_DATA_MODE`).

7. **Run and publish**

   ```bash
   pa app run          # open the "Local Play" URL
   npm run build
   pa app push
   ```

The app discovers the five generated services automatically (`import.meta.glob` in [src/data/dataverse/discover.ts](src/data/dataverse/discover.ts)), including their plural `entities` service names. Missing services and failed queries surface as errors in live mode. Keep `src/generated` and `.power/schemas` with the project when deploying.

## Architecture

```
src/
  config/          app-config.ts (env), dataverse-schema.ts (mserp_* table/column mapping)
  domain/          provider-agnostic RFQ domain model
  data/            repository contracts, data-context factory
    sample/        deterministic sample data + in-memory repository
    dataverse/     generated-service discovery, virtual table repository, Outlook e-mail
  hooks/           TanStack Query hooks (queries + send-invites mutation)
  lib/             analytics (dashboard), comparison engine, e-mail template, formatting
  components/      app shell, RFQ widgets, invite dialog, comparison workspace parts
  pages/           overview, rfqs, rfq-detail, compare
```

### Comparison scoring

Each selected reply is scored from 0 to 100 on five criteria, then combined using the user's weights:

- **Price**: lowest normalised total ÷ reply's normalised total. Unquoted lines are imputed with the average of the other offers so partial quotes compare fairly.
- **Delivery**: fastest maximum line lead time ÷ reply's maximum lead time.
- **Vendor**: rating (60%) and on-time delivery (40%) when available.
- **Coverage**: share of RFQ lines quoted.
- **Payment terms**: net days ÷ longest net days.

The split-award view assigns each line to the lowest effective unit price and compares the result with the best single-vendor award.

### AI comparison brief

In **Compare replies**, select two to six offers and choose **AI comparison brief**, then **Analyze selected replies**. This explicitly sends only the selected comparison facts and scoring priorities through the authenticated Microsoft Copilot Studio connector. Vendor notes and contact details are not sent. No ERP mutations, e-mails, awards or external research are performed.

The dedicated agent is `rfq_comparisonAdvisor` (display name **RFQ Comparison Advisor**), published in Frontier. Its source is in [agent/](agent/). Authentication is integrated and access remains restricted; users need access to the agent and its connector connection, as well as the underlying virtual tables.

- The application, not the model, calculates totals, scores and pairwise price/known-lead-time differences.
- Currency differences, quantity mismatches, partial coverage, invalid pricing and expired offers block a vendor recommendation. There is no FX conversion. Missing terms, validity and performance history are explicitly flagged.
- Known lead times are not promised receipt dates. Financial totals do not include unspecified freight, taxes or charges.
- Agent output must match a bounded JSON structure and cite known evidence IDs. Citations make review possible; they do not prove the generated interpretation is correct.
- Changing the selected replies, weights, evidence, legal entity, case or UTC date invalidates the previous analysis. Briefs remain session-only; copied briefs include supporting evidence.
- Connector errors, invalid JSON, unknown references and timeouts are shown explicitly. There is no simulated AI fallback.

For another environment, add a connection and deploy the agent:

```bash
pa app add data-source --connector shared_microsoftcopilotstudio --connection-id <connection-id>
pac copilot push --project-dir .\agent
pac copilot publish --bot rfq_comparisonAdvisor --environment <environment-id>
```

The agent workspace is linked to Frontier; use the supported CLI workspace deployment/clone workflow to target another environment rather than reusing its local connection metadata. If the agent schema name changes, update [src/data/comparison-advisor.ts](src/data/comparison-advisor.ts).

The generated connector currently uses `ExecuteCopilotAsyncV2(Copilot, body)` and declares its dynamic response as `void`. The adapter treats the response data as `unknown` and validates `lastResponse` or the final entry in `responses` as JSON at runtime without modifying generated code. The live connector can return `completed: false` with a complete response because the conversation remains open; a valid brief is required and responses requesting further input are rejected. Each analysis starts a fresh conversation.

See [Microsoft's code app integration guide](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-copilot-studio) and [connector reference](https://learn.microsoft.com/connectors/microsoftcopilotstudio/).

### RFQ health monitoring

The overview scans accessible open RFQs in the selected legal entity on load, on **Refresh**, and every five minutes while the overview is open. It fetches requested and reply lines with at most four concurrent case-detail requests. It does not run scheduled server-side jobs, send notifications, or mutate ERP records. RFQ detail pages evaluate the currently loaded record with the same rules.

Rules in [src/lib/rfq-health.ts](src/lib/rfq-health.ts):

- Reply deadline overdue: high priority. Due within seven calendar days: medium, or high within two days (including today).
- Within seven days of deadline or overdue: fewer than two **Received** replies is high priority. A response rate below 50% is medium. Received, accepted and rejected count as bids; declined vendor RFQs remain in the sent denominator; draft, canceled and removed are excluded. No invitations means an unknown rate, not a fabricated 0%.
- Received offers with missing/invalid requested-line prices, quantity/item mismatches, duplicate/missing lines, missing delivery information, payment terms or quote validity require review.
- A price spread of at least 20%, calculated as `(highest - lowest) / lowest`, is flagged only when **all** received offers have full coverage, matching requested items/quantities, valid positive prices/amounts, the same known currency and no known expired validity. ERP net amounts are used; no FX, taxes or freight are inferred. Unknown validity remains a separate warning.
- Missing/invalid deadlines and unavailable requested lines are explicit information gaps, not healthy results. Dates use their date-only portion and browser-local calendar days.

The queue shows scan coverage, last completion time and per-case failures. A failed refresh keeps the previous scan visible with an error; a partially failed scan never claims all RFQs were checked. Findings are read-only, not persisted approvals or compliance certifications. Filters do not dismiss issues; corrected source data clears findings on the next successful scan. Access and source completeness remain limited to records/fields visible through the existing VRM virtual entities.

### Award recommendation pack

In **Compare replies**, select two to six received replies, then choose **Award recommendation pack**. Select the preferred offer, enter the preparer and decision rationale, acknowledge review, and choose **Prepare preview**. Review the sandboxed document and unresolved risks, then **Download HTML memo**. Open the downloaded file in a browser to print/save as PDF.

The self-contained memo includes RFQ/company scope, selected offer totals and scores, scoring weights and component scores, buyer preference (including any departure from the top score), ties, known lead times, missing terms, health findings, and a frozen source-evidence appendix. Financial values come from the existing comparison engine; the rationale is buyer-written, not generated by AI. Only selected replies are evaluated.

- Requires an open RFQ and Received replies. Mixed currencies, incomplete coverage, expired validity, invalid pricing, quantity/item mismatches and duplicate quoted lines block export.
- Missing validity and performance history remain explicit unresolved risks. Known lead times are not receipt guarantees. No freight, taxes, FX or unprovided supplier data is invented.
- The case is reloaded before preparation and again before download. Source changes require a new preview. Input, selection, weights or date changes invalidate the preview. Vendor evaluation data uses the currently loaded comparison data.
- Prepared-by and review acknowledgment are buyer assertions, not authenticated signatures. Approval status is **Not requested / not recorded**; there is no persisted workflow or approval history. No bid acceptance/rejection, purchase order, email or ERP update is performed.
- The downloaded HTML escapes buyer and ERP content, disallows scripts/network resources, and is a point-in-time document. It is not an immutable shared audit log; store it using your organization's records process and revalidate before taking action.

Implementation: [src/lib/award-pack.ts](src/lib/award-pack.ts) and [src/components/compare/award-pack.tsx](src/components/compare/award-pack.tsx).

### Natural-language RFQ assistant

Open **RFQ assistant** from the workspace navigation. Choose all accessible RFQs or one RFQ, type a question or select a suggestion, then choose **Ask assistant**. Examples:

- Which open RFQs need attention?
- Which RFQs expire in the next seven days?
- For RFQ 000432, what are the vendor totals and known lead times?
- Which received offers have a known lead time of 14 days or less?

The dedicated `rfq_inquiryAssistant` agent uses integrated authentication and the existing Copilot Studio connector. Its workspace is [inquiry-agent/](inquiry-agent/). No ERP MCP tools or other action tools are attached; browsing, external knowledge, file analysis and semantic search are disabled. Data comes exclusively from the app's authorized company-filtered repository.

Each question reloads case details (maximum four concurrent requests), builds an allowlisted evidence snapshot without vendor contacts/notes, and sends it plus up to three previous turns for conversational context. Scope is limited to 50 accessible RFQs and 120,000 serialized evidence characters; exceeding either limit requires selecting one RFQ, never silent truncation. Failed case reads are named as incomplete evidence; complete failures show an error. There is a three-minute request timeout.

Answers must be bounded JSON with a valid source reference for every claim. Sources expand to raw facts and app-generated RFQ/comparison links; arbitrary model-provided URLs or HTML are not rendered. Citations enable verification but do not guarantee semantic correctness. Missing values remain unknown, financial totals are calculated in application code, and lead times are not delivery guarantees. No cross-company inquiry, email, ERP mutations, acceptance, purchase-order creation or approval workflow is available.

Conversation history is page-memory only (up to ten displayed turns), clears on scope/company changes or navigation, and can be cleared manually. Each answer shows its evidence timestamp, coverage and stale-date notice; ask again for fresh data. Other users need access to the published agent and connector as well as the underlying virtual entities. Publish agent changes with `pac copilot push --project-dir .\inquiry-agent` and `pac copilot publish --bot rfq_inquiryAssistant --environment <environment-id>`.

### Vendor follow-up agent

Open **Vendor follow-up**, choose **Scan outstanding replies**, and select **Review reminder**. The scan reads company-filtered open cases with valid deadlines within seven local calendar days or overdue, then loads details with at most four concurrent requests. Only vendor RFQs still **Sent** are eligible; received, declined, canceled, removed and draft vendor RFQs are not reminded. Coverage, missing deadlines and case failures are explicit. This is on-demand assistance, not a scheduled background job.

Review the standard draft or select **Draft with AI** using the dedicated `rfq_vendorFollowup` Copilot Studio agent ([followup-agent/](followup-agent/)). Only the selected vendor/RFQ identifiers, RFQ name, company and deadline are supplied to that agent, not addresses, contacts, competitor data or prices. Agent output is bounded JSON; failure is displayed without an automatic fallback. AI drafts are untrusted suggestions requiring buyer verification. The agent has no email or ERP tools. Integrated authentication and agent/connector permissions are required.

Recipients come from a unique match in the selected company's vendor directory. Missing, duplicate or invalid vendor addresses block sending; correct the source and scan again. The message is editable plain text, HTML-escaped for Outlook, and previewed before approval. Editing or regenerating clears approval. The final **Approve and send one email** action sends exactly one message through the connected Outlook mailbox; no CC/BCC or attachments. Simulated sending is explicitly disabled. This action is the only way the follow-up workflow sends email.

Immediately before sending, the app re-reads the case and vendor directory, checks case/company/vendor identity, Sent status, deadline eligibility, recipient and source-fact equality (including calendar-day changes). Stale drafts require a new scan and review. The app persists a pending attempt before calling Outlook, requires browser Web Locks for cross-tab serialization, and blocks reminders to the same company/case/vendor RFQ for 24 hours after Outlook acceptance. Pending or ambiguous connector outcomes block further reminders indefinitely rather than automatically retrying; check Outlook Sent Items and have the local history reconciled under your support process. There is no in-app override. Outlook acceptance is not a delivery or read receipt.

The dedicated follow-up history stores recipient, subject, timestamp and delivery state in browser localStorage, separately from invitation history. Storage failure blocks sending. History/duplicate protection are local to this browser origin, not a shared audit or approval store; other users/devices and clearing browser data bypass that protection. Do not use them to resend uncertain messages. Shared multi-user coordination requires a future server-side outbox/idempotency store. No ERP status, deadline, award, purchase order or persisted approval workflow is changed.

Deploy agent updates with `pac copilot push --project-dir .\followup-agent` then `pac copilot publish --bot rfq_vendorFollowup --environment <environment-id>`. Implementation: [src/lib/vendor-followup.ts](src/lib/vendor-followup.ts), [src/data/vendor-followup.ts](src/data/vendor-followup.ts) and [src/pages/vendor-followup.tsx](src/pages/vendor-followup.tsx).

### Quote-document extraction

Open **Quote extraction**, select an accessible RFQ case and target vendor RFQ in the current legal entity, then choose a text-based PDF or paste complete quote/email text. **Read PDF locally** uses PDF.js in the browser; it does not upload the original PDF. **Prepare pasted text** creates numbered source sections. Inspect **Read all extracted source text before sending**, authorize sending its contents to Copilot Studio, then choose **Extract quote facts**.

- Supported limits: one vendor quote/currency per extraction, PDF up to 5 MB / 20 pages, up to 60,000 text characters, up to 20 quoted rows. Limits fail explicitly, never silently truncate. Password-protected/malformed PDFs, unreadable or image-only pages require an unlocked text-based copy or verified pasted text. OCR, images, DOCX/Excel and automatic mailbox attachment ingestion are not supported.
- PDF text order may differ from its visual layout. Mixed scanned/text pages can contain omitted image-only rows even when readable text exists. Always compare every page with the original; the app cannot guarantee document completeness or detect all missing image content. This feature is extraction assistance, not an OCR/document-certification service.
- The dedicated `rfq_quoteExtraction` agent ([extraction-agent/](extraction-agent/)) receives source text only, not ERP replies, expected prices or competitor offers. Browser-side reading alone does not send it to the agent. Text can include sensitive vendor content; only authorized documents should be submitted. The agent has integrated authentication, browsing disabled and no attached action tools. It is instructed to use supplied sources only.
- Extracted header fields: vendor name, quote reference/date, currency, validity, payment/delivery terms and stated total. Rows: item, description, quantity/unit, unit price and price basis, discount, stated amount, stated lead days and delivery date. Unknown/ambiguous fields stay blank, not zero. A bare currency symbol, unclear number format or ambiguous date must not be guessed. No financial arithmetic, unit conversions, FX, taxes/freight assumptions or scoring is performed.
- Every non-null AI field must include a known source ID and a verbatim excerpt; unknown citations, invented excerpts, invalid values or incomplete output reject the extraction. Citations establish that text exists, not that the extracted value is semantically correct. Model-declared completeness is not proof that every quote row was found.
- Correct any field, explicitly map every included row to a unique requested RFQ line, or exclude it with a reason. Add missed quoted rows manually when needed. Original AI values/evidence remain separate from buyer edits; blank values and unmapped/mismatched items are visible. Vendor/currency/quantity/unit discrepancies, unknown validity/pricing and incomplete requested-line coverage are warnings, not automatic corrections.
- Enter reviewer and notes, review all warnings, and acknowledge the exact values/mappings/exclusions before **Export reviewed JSON**. Every edit clears acknowledgment. Export re-reads the company/case/vendor/line reference; changes invalidate the staged reference and require re-extraction/review. A calendar-day change also requires fresh extraction/review. Reviewer identity/acknowledgment are buyer assertions, not authenticated signatures.
- Export includes original extraction, reviewed values/mappings, exclusions/reasons, source text/page references, timestamps, warnings and a SHA-256 fingerprint of serialized extracted text (not the PDF bytes). Exported unknown fields are blank strings; original unknown AI fields are explicit nulls. This is a staging package, **not posted/approved/imported into ERP**; it cannot enter official reply scoring automatically. Store exports securely using your records policy.

Document text and staged review are page-memory only and clear on navigation or company/case/vendor changes. No document or review is saved in app localStorage/Dataverse. Submitted text is processed by Copilot Studio and may be retained under the environment's agent/transcript policies; browser-memory clearing does not remove those service-side records. Three-minute operation timeouts discard late responses; an agent request already submitted may continue server-side.

Deploy agent updates with `pac copilot push --project-dir .\extraction-agent` and `pac copilot publish --bot rfq_quoteExtraction --environment <environment-id>`. Users need agent/connector and underlying RFQ data permissions. PDF.js and its worker are bundled locally, loaded on demand, with no third-party PDF upload service. Implementation: [src/lib/quote-extraction.ts](src/lib/quote-extraction.ts), [src/data/quote-document.ts](src/data/quote-document.ts), [src/data/quote-extraction.ts](src/data/quote-extraction.ts) and [src/pages/quote-extraction.tsx](src/pages/quote-extraction.tsx).

## Notes and limitations

- The app is read-only towards F&SC. Accepting or rejecting replies and creating purchase orders stays in F&SC; use *Open in F&SC*.
- Every record query filters `mserp_dataareaid`; duplicate RFQ numbers across companies cannot cross-join. Vendor headers are grouped into cases, case lines use `mserp_rfqcaselinelinenumber`, and alternate-product bids are excluded from the primary comparison.
- Reply unit prices and target prices are divided by their purchase-price quantity (for example, a price per 100 units). Reply totals use F&O's calculated line amounts. Accepted, Rejected, Declined and Removed use the verified F&O option-set values.
- The VRM headers do not expose RFQ creation or sent dates. Those fields remain unavailable rather than fabricated; creation trends and average response times can therefore be empty. Vendor response rate is based on vendor RFQ statuses. RFQ header procurement category is also unavailable.
- The invitation history is stored in the browser's localStorage. For a shared audit trail, add a custom Dataverse table and implement `InvitationStore`.
- Vendor rating and on-time delivery aren't part of `VendVendorV2Entity`. Map them from your vendor evaluation data to enable the *Vendor* criterion. Until then it's neutral for every vendor.
- When hosted in Power Apps, the app always starts at its root route (see the basename logic in `src/router.tsx`).
