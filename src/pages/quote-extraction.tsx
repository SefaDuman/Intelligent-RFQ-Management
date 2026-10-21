import { useEffect, useRef, useState } from "react"
import { FileSearch, Download, Loader2, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Link } from "react-router-dom"
import { getDataContext } from "@/data"
import { extractQuote, exportReviewedQuote } from "@/data/quote-extraction"
import { useCompany } from "@/hooks/use-company"
import { useRfqCase, useRfqCases } from "@/hooks/use-rfq-data"
import { buildQuoteExport, createQuoteReview, QUOTE_HEADERS, QUOTE_LINE_FIELDS, QUOTE_LIMITS, quoteReviewWarnings, quoteSourceKey, quoteValueErrors, textQuoteDocument, type ExtractedField, type QuoteDocument, type QuoteExtraction, type QuoteHeaderKey, type QuoteLineKey, type QuoteReview } from "@/lib/quote-extraction"
import type { RfqCaseDetail } from "@/domain/types"
import { PageHeader } from "@/components/app/page-parts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

function QuoteField({ id, label, value, evidence, document, disabled, onChange }: {
  id: string; label: string; value: string; evidence?: ExtractedField; document: QuoteDocument; disabled: boolean; onChange: (value: string) => void
}) {
  const source = document.sources.find((item) => item.id === evidence?.sourceId)
  return <div className="min-w-0 space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} maxLength={500} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="Unknown / not stated" />
    {value !== (evidence?.value ?? "") && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Buyer-edited; original: {evidence?.value ?? "unknown"}</p>}
    {source ? <details className="text-xs"><summary className="cursor-pointer text-primary">Source {source.page ? `page ${source.page}` : "text"} · {source.id}</summary><p className="mt-1 break-words text-muted-foreground">"{evidence?.excerpt}"</p></details> : <p className="text-xs text-muted-foreground">Not extracted; verify in the original document.</p>}
  </div>
}

function QuoteWorkspace({ detail, rfqId }: { detail: RfqCaseDetail; rfqId: string }) {
  const [text, setText] = useState("")
  const [file, setFile] = useState<File>()
  const [document, setDocument] = useState<QuoteDocument>()
  const [result, setResult] = useState<{ extraction: QuoteExtraction; sourceKey: string; extractedAt: string }>()
  const [review, setReview] = useState<QuoteReview>()
  const [reviewer, setReviewer] = useState("")
  const [consent, setConsent] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState<string>()
  const active = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => { active.current?.abort(); active.current = undefined }, [])
  const sourceKey = quoteSourceKey(detail, rfqId)
  const stale = !!result && sourceKey !== result.sourceKey
  const warnings = review ? quoteReviewWarnings(review, detail, rfqId) : []
  const valueErrors = review ? quoteValueErrors(review) : []
  const resetResult = () => { setResult(undefined); setReview(undefined); setAcknowledged(false); setError(undefined) }
  const resetDocument = () => { resetResult(); setDocument(undefined); setConsent(false) }
  const editReview = (next: QuoteReview) => { setReview(next); setAcknowledged(false); setError(undefined) }
  const run = async (phase: string, action: (signal: AbortSignal) => Promise<void>) => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setBusy(phase); setError(undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([action(controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("The operation timed out. Retry with a smaller document; no ERP changes were made.")) }, 180000) })])
    } catch (cause) {
      if (active.current === controller) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      clearTimeout(timer)
      if (active.current === controller) { active.current = undefined; setBusy("") }
    }
  }
  const readPdf = () => {
    if (!file) return
    resetDocument()
    void run("Reading PDF locally...", async (signal) => {
      const { readQuotePdf } = await import("@/data/quote-document")
      const doc = await readQuotePdf(file, signal)
      signal.throwIfAborted()
      setDocument(doc)
    })
  }
  const extract = () => {
    if (!document || !consent) return
    resetResult()
    const key = sourceKey
    void run("Extracting quote facts with Copilot Studio...", async (signal) => {
      const extraction = await extractQuote(document)
      signal.throwIfAborted()
      setResult({ extraction, sourceKey: key, extractedAt: new Date().toISOString() })
      setReview(createQuoteReview(extraction))
    })
  }
  const download = () => {
    if (!document || !result || !review) return
    const input: Parameters<typeof buildQuoteExport>[0] = { company: detail.header.company, caseId: detail.header.rfqCaseId, rfqId, sourceKey: result.sourceKey, document, extraction: result.extraction, review, reviewer, acknowledged, extractedAt: result.extractedAt }
    void run("Rechecking RFQ and preparing reviewed export...", async (signal) => {
      const ctx = await getDataContext()
      const exported = await exportReviewedQuote(ctx.repository, input)
      signal.throwIfAborted()
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json;charset=utf-8" }))
      const anchor = window.document.createElement("a")
      anchor.href = url
      anchor.download = `quote-review-${detail.header.company}-${detail.header.rfqCaseId}-${rfqId}.json`.replace(/[^a-zA-Z0-9._-]/g, "-")
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast.success("Reviewed JSON export prepared. This is staging only; nothing was posted to ERP.")
    })
  }
  return <div className="space-y-5">
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">1. Read a quote document</h2>
      <p className="text-sm text-muted-foreground">One quote, one vendor, one currency. PDF: up to 5 MB / 20 pages; extracted text: up to 60,000 characters; up to 20 quoted rows. Text reading cannot detect all image-only rows on mixed pages: compare every page with the original. Scanned documents need OCR outside this app.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="quote-pdf">Text-based PDF</Label><Input id="quote-pdf" type="file" accept=".pdf,application/pdf" disabled={!!busy} onChange={(event) => { resetDocument(); setFile(event.target.files?.[0]); setText("") }} /><Button variant="outline" disabled={!!busy || !file} onClick={readPdf}><FileSearch />Read PDF locally</Button></div>
        <div className="space-y-2"><Label htmlFor="quote-text">Or paste quote / email text</Label><Textarea id="quote-text" rows={5} maxLength={QUOTE_LIMITS.characters + 1} disabled={!!busy} value={text} onChange={(event) => { resetDocument(); setText(event.target.value); setFile(undefined) }} placeholder="Paste the complete single-vendor quote, including column headings, units, currency and terms." /><Button variant="outline" disabled={!!busy || !text.trim()} onClick={() => { resetDocument(); try { setDocument(textQuoteDocument(text)) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }}>Prepare pasted text</Button></div>
      </div>
      {document && <>
        <p className="text-sm"><strong>{document.name}</strong> · {document.sources.length} source sections · {document.sources.reduce((sum, item) => sum + item.text.length, 0).toLocaleString()} text characters</p>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Read all extracted source text before sending</summary><div className="mt-3 max-h-96 space-y-3 overflow-y-auto">{document.sources.map((source) => <div key={source.id}><p className="text-xs font-medium">{source.id}{source.page ? ` · PDF page ${source.page}` : " · pasted text"}</p><pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{source.text}</pre></div>)}</div></details>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} disabled={!!busy} onChange={(event) => setConsent(event.target.checked)} />I verified that the text represents this quote and I am authorized to send its contents to the connected Copilot Studio agent.</label>
        <Button disabled={!!busy || !consent} onClick={extract}><Sparkles />Extract quote facts</Button>
      </>}
    </section>
    {review && result && document && <section className="space-y-5 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">2. Verify fields and map every quoted row</h2>
      <p className="text-sm text-muted-foreground">AI extraction is not a verified quote. Citations confirm text exists, not that AI interpreted it correctly. Unknown fields remain blank; numeric values use plain decimal notation and dates YYYY-MM-DD. No prices or totals are calculated.</p>
      {stale && <p role="alert" className="text-sm text-destructive">RFQ source changed. Re-extract and review against the current RFQ before export.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(QUOTE_HEADERS) as QuoteHeaderKey[]).map((key) => <QuoteField key={key} id={`quote-${key}`} label={QUOTE_HEADERS[key]} document={document} value={review.header[key]} evidence={result.extraction.header[key]} disabled={!!busy} onChange={(value) => editReview({ ...review, header: { ...review.header, [key]: value } })} />)}</div>
      {review.lines.map((line, index) => <div key={index} className="space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">Quote row {index + 1}{line.originIndex === null ? " · buyer-added" : ""}</h3><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={line.excluded} disabled={!!busy} onChange={(event) => editReview({ ...review, lines: review.lines.map((item, i) => i === index ? { ...item, excluded: event.target.checked } : item) })} />Exclude from mapped rows</label></div>
        <div className="space-y-2"><Label htmlFor={`quote-map-${index}`}>Map row {index + 1} to requested RFQ line</Label><select id={`quote-map-${index}`} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" disabled={!!busy || line.excluded} value={line.requestedLine} onChange={(event) => editReview({ ...review, lines: review.lines.map((item, i) => i === index ? { ...item, requestedLine: event.target.value } : item) })}>
          <option value="">Unmapped - buyer selection required</option>{detail.lines.map((requested) => <option key={requested.lineNumber} value={String(requested.lineNumber)}>#{requested.lineNumber} · {requested.itemNumber} · {requested.quantity} {requested.unit}</option>)}
        </select></div>
        {line.excluded && <div className="space-y-2"><Label htmlFor={`quote-reason-${index}`}>Exclusion reason for row {index + 1}</Label><Input id={`quote-reason-${index}`} maxLength={500} value={line.reason} disabled={!!busy} onChange={(event) => editReview({ ...review, lines: review.lines.map((item, i) => i === index ? { ...item, reason: event.target.value } : item) })} /></div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(QUOTE_LINE_FIELDS) as QuoteLineKey[]).map((key) => <QuoteField key={key} id={`quote-line-${index}-${key}`} label={`Row ${index + 1} ${QUOTE_LINE_FIELDS[key]}`} value={line.values[key]} evidence={line.originIndex === null ? undefined : result.extraction.lines[line.originIndex]?.[key]} document={document} disabled={!!busy} onChange={(value) => editReview({ ...review, lines: review.lines.map((item, i) => i === index ? { ...item, values: { ...item.values, [key]: value } } : item) })} />)}</div>
      </div>)}
      <Button variant="outline" disabled={!!busy || review.lines.length >= QUOTE_LIMITS.lines} onClick={() => editReview({ ...review, lines: [...review.lines, { originIndex: null, values: Object.fromEntries(Object.keys(QUOTE_LINE_FIELDS).map((key) => [key, ""])) as Record<QuoteLineKey, string>, requestedLine: "", excluded: false, reason: "" }] })}><Plus />Add missing quoted row</Button>
      {valueErrors.length > 0 && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive"><ul className="list-disc pl-4">{valueErrors.map((message) => <li key={message}>{message}</li>)}</ul></div>}
      <div className="rounded-lg border border-amber-500 p-4 text-sm"><h3 className="font-medium">Review warnings and limitations</h3><ul className="mt-2 list-disc space-y-1 pl-4">{warnings.map((message) => <li key={message}>{message}</li>)}</ul></div>
      <div className="space-y-2"><Label htmlFor="quote-reviewer">Reviewed by</Label><Input id="quote-reviewer" maxLength={200} disabled={!!busy} value={reviewer} onChange={(event) => { setReviewer(event.target.value); setAcknowledged(false) }} /></div>
      <div className="space-y-2"><Label htmlFor="quote-review-notes">Review notes and unresolved gaps</Label><Textarea id="quote-review-notes" rows={3} maxLength={2000} value={review.notes} disabled={!!busy} onChange={(event) => editReview({ ...review, notes: event.target.value })} placeholder="Record identity checks, corrections, exclusions and any missing or ambiguous terms." /></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={!!busy || stale} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I checked every original page/text section for omitted rows, verified vendor identity and the exact values, mappings, exclusions and warnings above. This is a staging export, not an ERP reply or approval.</label>
      <Button className="h-auto whitespace-normal" disabled={!!busy || stale || !acknowledged || !reviewer.trim() || !review.notes.trim() || !!valueErrors.length} onClick={download}><Download />Export reviewed JSON</Button>
      <p className="text-xs text-muted-foreground">Export includes original AI fields, buyer edits, source text/page references and an extracted-text SHA-256 fingerprint. Store it securely under your records policy. The fingerprint is not a signature or a hash of the original PDF.</p>
    </section>}
    {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{busy}</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">{error}</p>}
  </div>
}

export default function QuoteExtractionPage() {
  const { company } = useCompany()
  const cases = useRfqCases()
  const [caseId, setCaseId] = useState("")
  const [rfqId, setRfqId] = useState("")
  const detail = useRfqCase(caseId || undefined)
  const accessible = detail.data?.header.company.toLowerCase() === company?.toLowerCase() && detail.data?.header.rfqCaseId === caseId
  return <div className="space-y-5">
    <PageHeader eyebrow="Buyer-reviewed staging" title="Quote-document extraction" description={`Extract vendor quote facts and map them to an accessible RFQ in ${company?.toUpperCase()}. No ERP writes.`} />
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">Document text stays in page memory until you explicitly send it for extraction. Only document text is sent to the dedicated agent, not ERP replies or competitor prices. No email attachment fetching, OCR, ERP import, comparison scoring or automatic actions. Changing RFQ/vendor/company or leaving this page clears staged work.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="quote-case">Target RFQ case</Label><select id="quote-case" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={caseId} disabled={cases.isLoading} onChange={(event) => { setCaseId(event.target.value); setRfqId("") }}><option value="">Select an RFQ</option>{cases.data?.map((rfq) => <option key={rfq.rfqCaseId} value={rfq.rfqCaseId}>{rfq.rfqCaseId} · {rfq.name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="quote-vendor">Target vendor RFQ</Label><select id="quote-vendor" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={rfqId} disabled={!accessible || detail.isFetching} onChange={(event) => setRfqId(event.target.value)}><option value="">Select vendor RFQ</option>{accessible && detail.data?.replies.map((reply) => <option key={reply.rfqId} value={reply.rfqId}>{reply.vendorName} · {reply.rfqId} · {reply.status}</option>)}</select></div>
      </div>
      {caseId && <Link className="text-sm text-primary underline" to={`/rfqs/${encodeURIComponent(caseId)}`}>Open target RFQ</Link>}
      {detail.isFetching && <p role="status" className="text-sm">Loading current RFQ...</p>}
      {(cases.error || detail.error) && <p role="alert" className="text-sm text-destructive">{cases.error?.message || detail.error?.message}</p>}
      {caseId && !detail.isFetching && !detail.error && !accessible && <p role="alert" className="text-sm text-destructive">The RFQ is unavailable in the selected legal entity.</p>}
    </div>
    {accessible && detail.data && !detail.error && detail.data.replies.some((reply) => reply.rfqId === rfqId) && <QuoteWorkspace key={`${company}:${caseId}:${rfqId}`} detail={detail.data} rfqId={rfqId} />}
  </div>
}
