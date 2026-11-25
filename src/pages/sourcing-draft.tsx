import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Download, FilePlus2, Plus, Trash2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState, PageHeader, SectionCard } from "@/components/app/page-parts"
import { SupplierShortlist } from "@/components/sourcing/supplier-shortlist"
import { useCompany } from "@/hooks/use-company"
import { draftStore, useCollection } from "@/hooks/use-sourcing"
import { useReplies, useRfqCases, useVendors } from "@/hooks/use-rfq-data"
import { downloadText } from "@/lib/comparison"
import { criteriaWeightTotal } from "@/lib/sourcing/evaluation"
import { buildDraftPackage, EVENT_TEMPLATES, newDraft, parseRequirement, templateById, validateDraft, type RfqDraft } from "@/lib/sourcing/rfq-draft"
import { addDays, format } from "date-fns"
import { cn } from "@/lib/utils"

function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function DraftEditor({ initial, categories }: { initial: RfqDraft; categories: string[] }) {
  const [draft, setDraft] = useState(initial)
  const [warnings, setWarnings] = useState<string[]>([])
  const dirty = useRef(false)
  const cases = useRfqCases()
  const vendors = useVendors()
  const replies = useReplies()

  const update = (patch: Partial<RfqDraft>) => {
    dirty.current = true
    setDraft((d) => ({ ...d, ...patch }))
  }

  useEffect(() => {
    if (!dirty.current || (!draft.title && !draft.lines.length && !draft.requirementText)) return
    const timer = setTimeout(() => {
      try {
        draftStore.upsert(draft)
      } catch {
        toast.error("This browser could not save the draft. Download the package before leaving.")
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [draft])

  const issues = useMemo(() => validateDraft(draft), [draft])
  const errors = issues.filter((i) => i.level === "error")
  const weightTotal = Math.round(criteriaWeightTotal(draft.criteria))

  const applyTemplate = (id: string) => {
    const template = templateById(id)
    update({
      templateId: template.id,
      eventType: template.eventType,
      criteria: template.criteria.map((c) => ({ ...c })),
      technicalWeightPct: template.technicalWeightPct,
      paymentTerms: template.paymentTerms,
      deliveryTerms: template.deliveryTerms,
      replyByDate: format(addDays(new Date(), template.replyDays), "yyyy-MM-dd"),
    })
  }

  const interpret = () => {
    const parsed = parseRequirement(draft.requirementText, { categories, defaultCurrency: draft.currency })
    update({
      title: draft.title || parsed.title,
      lines: parsed.lines.length ? parsed.lines : draft.lines,
      category: parsed.category ?? draft.category,
      currency: parsed.currency ?? draft.currency,
      replyByDate: parsed.replyByDate ?? draft.replyByDate,
      requestedDeliveryDate: parsed.requestedDeliveryDate ?? draft.requestedDeliveryDate,
      justification: parsed.justification ?? draft.justification,
    })
    setWarnings(parsed.warnings)
    if (parsed.lines.length) toast.success(`Read ${parsed.lines.length} line${parsed.lines.length === 1 ? "" : "s"}. Review the details below.`)
  }

  const exportPackage = () => {
    downloadText(`rfq-draft-${draft.title.trim().replace(/[^\w-]+/g, "-").toLowerCase() || draft.id}.json`, JSON.stringify(buildDraftPackage(draft), null, 2), "application/json;charset=utf-8")
  }

  return (
    <div className="space-y-5">
      <SectionCard title="1 · Describe the requirement" description="Paste what the requester asked for. One item per line works best, for example “20 x Laptop @ 1200”.">
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <Field label="Event template" htmlFor="template">
            <select id="template" value={draft.templateId} onChange={(e) => applyTemplate(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {EVENT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">{templateById(draft.templateId).description}</p>
          </Field>
          <div className="space-y-2">
            <Textarea aria-label="Requirement text" rows={6} value={draft.requirementText} onChange={(e) => update({ requirementText: e.target.value })}
              placeholder={"Laptops for new hires in Croatia\n- 20 x Dell Latitude 7450 @ €1,250\n- 20 x Docking station\nDeliver by 15 December"} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={interpret} disabled={!draft.requirementText.trim()}><Wand2 /> Draft RFQ from text</Button>
              <span className="text-xs text-muted-foreground">Rule-based reading, no AI call. Everything below stays editable.</span>
            </div>
            {warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="2 · Event details">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Title" htmlFor="title" className="xl:col-span-2"><Input id="title" value={draft.title} onChange={(e) => update({ title: e.target.value })} /></Field>
          <Field label="Procurement category" htmlFor="category">
            <Input id="category" list="draft-categories" value={draft.category ?? ""} onChange={(e) => update({ category: e.target.value || undefined })} />
            <datalist id="draft-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Currency" htmlFor="currency"><Input id="currency" maxLength={3} value={draft.currency} onChange={(e) => update({ currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Reply by" htmlFor="reply-by"><Input id="reply-by" type="date" value={draft.replyByDate ?? ""} onChange={(e) => update({ replyByDate: e.target.value || undefined })} /></Field>
          <Field label="Requested delivery" htmlFor="delivery"><Input id="delivery" type="date" value={draft.requestedDeliveryDate ?? ""} onChange={(e) => update({ requestedDeliveryDate: e.target.value || undefined })} /></Field>
          <Field label="Delivery terms" htmlFor="delivery-terms"><Input id="delivery-terms" value={draft.deliveryTerms ?? ""} onChange={(e) => update({ deliveryTerms: e.target.value || undefined })} /></Field>
          <Field label="Payment terms" htmlFor="payment-terms"><Input id="payment-terms" value={draft.paymentTerms ?? ""} onChange={(e) => update({ paymentTerms: e.target.value || undefined })} /></Field>
          <Field label="Justification / notes" htmlFor="justification" className="md:col-span-2 xl:col-span-4"><Textarea id="justification" rows={2} value={draft.justification ?? ""} onChange={(e) => update({ justification: e.target.value || undefined })} /></Field>
        </div>
      </SectionCard>

      <SectionCard
        title="3 · Lines"
        action={<Button type="button" size="sm" variant="outline" onClick={() => update({ lines: [...draft.lines, { id: crypto.randomUUID(), itemName: "", quantity: 1, unit: "pcs" }] })}><Plus /> Add line</Button>}
      >
        {draft.lines.length === 0 ? <p className="text-sm text-muted-foreground">No lines yet. Draft from text above or add one.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="w-8 pb-2">#</th><th className="pb-2">Item</th><th className="w-24 pb-2">Quantity</th><th className="w-24 pb-2">Unit</th><th className="w-32 pb-2">Target price</th><th className="w-10" /></tr></thead>
              <tbody>
                {draft.lines.map((line, i) => {
                  const set = (patch: Partial<typeof line>) => update({ lines: draft.lines.map((l) => (l.id === line.id ? { ...l, ...patch } : l)) })
                  return (
                    <tr key={line.id}>
                      <td className="py-1 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1 pr-2"><Input aria-label={`Line ${i + 1} item`} value={line.itemName} onChange={(e) => set({ itemName: e.target.value })} /></td>
                      <td className="py-1 pr-2"><Input aria-label={`Line ${i + 1} quantity`} type="number" min={0} value={line.quantity} onChange={(e) => set({ quantity: Number(e.target.value) })} /></td>
                      <td className="py-1 pr-2"><Input aria-label={`Line ${i + 1} unit`} value={line.unit} onChange={(e) => set({ unit: e.target.value })} /></td>
                      <td className="py-1 pr-2"><Input aria-label={`Line ${i + 1} target price`} type="number" min={0} step="0.01" value={line.targetUnitPrice ?? ""} onChange={(e) => set({ targetUnitPrice: e.target.value === "" ? undefined : Number(e.target.value) })} /></td>
                      <td className="py-1"><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} onClick={() => update({ lines: draft.lines.filter((l) => l.id !== line.id) })}><Trash2 /></Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="4 · Evaluation criteria"
        description="Scored 0–5 by evaluators in the sourcing workbench once bids arrive; price is scored from the quotes."
        action={<Button type="button" size="sm" variant="outline" onClick={() => update({ criteria: [...draft.criteria, { id: crypto.randomUUID(), label: "", weight: 0 }] })}><Plus /> Add criterion</Button>}
      >
        <div className="space-y-2">
          {draft.criteria.map((c, i) => {
            const set = (patch: Partial<typeof c>) => update({ criteria: draft.criteria.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) })
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <Input aria-label={`Criterion ${i + 1} name`} className="min-w-48 flex-1" value={c.label} onChange={(e) => set({ label: e.target.value })} />
                <Input aria-label={`Criterion ${i + 1} weight`} className="w-24" type="number" min={0} value={c.weight} onChange={(e) => set({ weight: Number(e.target.value) })} />
                <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={!!c.mustPass} onCheckedChange={(v) => set({ mustPass: v === true })} /> Must pass</label>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove criterion ${i + 1}`} onClick={() => update({ criteria: draft.criteria.filter((x) => x.id !== c.id) })}><Trash2 /></Button>
              </div>
            )
          })}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
            <span className={cn("tabular", weightTotal !== 100 && draft.criteria.length > 0 && "text-amber-600 dark:text-amber-400")}>Weights total {weightTotal}</span>
            <Label htmlFor="tech-weight" className="ml-auto">Technical share of final score</Label>
            <Input id="tech-weight" className="w-20" type="number" min={0} max={100} value={draft.technicalWeightPct} onChange={(e) => update({ technicalWeightPct: Math.min(100, Math.max(0, Number(e.target.value))) })} />
            <span className="text-xs text-muted-foreground">% (price {100 - draft.technicalWeightPct}%)</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`5 · Supplier shortlist (${draft.shortlist.length})`} description="Ranked by category fit, performance, responsiveness and bidding history.">
        {vendors.error || cases.error || replies.error ? <ErrorState error={vendors.error ?? cases.error ?? replies.error} /> : vendors.isLoading ? <Skeleton className="h-40" /> : (
          <SupplierShortlist vendors={vendors.data ?? []} cases={cases.data ?? []} replies={replies.data ?? []} category={draft.category} selected={draft.shortlist} onChange={(shortlist) => update({ shortlist })} />
        )}
      </SectionCard>

      <SectionCard title="6 · Readiness" description="Create the RFQ in Dynamics 365 from this package, then invite the shortlisted suppliers from the RFQ page.">
        <ul className="space-y-1.5 text-sm">
          {issues.map((issue, i) => (
            <li key={i} className={cn("flex items-start gap-2", issue.level === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-300")}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{issue.message}
            </li>
          ))}
          {!issues.length && <li className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" /> Ready for review.</li>}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={errors.length > 0} onClick={exportPackage}><Download /> Download draft package</Button>
          <span className="text-xs text-muted-foreground">Staging file only. Nothing is written to Dynamics 365 and no supplier is contacted.</span>
        </div>
      </SectionCard>
    </div>
  )
}

function DraftWorkspace({ categories, currency }: { categories: string[]; currency: string }) {
  const { company = "" } = useCompany()
  const [params, setParams] = useSearchParams()
  const drafts = useCollection(draftStore)
  const [blank, setBlank] = useState(() => newDraft(company, currency))
  const selected = drafts.find((d) => d.id === params.get("draft"))
  const initial = selected ?? blank

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sourcing"
        title="RFQ drafting"
        description="Turn a requirement into an RFQ draft with lines, evaluation criteria and a ranked supplier shortlist."
        actions={<Button variant="outline" onClick={() => { setBlank(newDraft(company, currency)); setParams({}) }}><FilePlus2 /> New draft</Button>}
      />
      {drafts.length > 0 && (
        <details className="rounded-xl border bg-card px-5 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Saved drafts ({drafts.length}) · stored in this browser</summary>
          <ul className="mt-3 divide-y">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <button type="button" className={cn("min-w-0 flex-1 truncate text-left hover:underline", d.id === initial.id && "font-semibold")} onClick={() => setParams({ draft: d.id })}>
                  {d.title || "Untitled draft"} <span className="text-xs text-muted-foreground">· {d.lines.length} lines · {new Date(d.updatedAt).toLocaleString()}</span>
                </button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete draft ${d.title || d.id}`} onClick={() => { draftStore.remove(d.id); if (d.id === initial.id) setParams({}) }}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <DraftEditor key={initial.id} initial={initial} categories={categories} />
    </div>
  )
}

export default function SourcingDraftPage() {
  const cases = useRfqCases()
  const vendors = useVendors()
  const categories = useMemo(
    () => [...new Set([...(cases.data ?? []).map((c) => c.procurementCategory), ...(vendors.data ?? []).map((v) => v.vendorGroup)].filter((c): c is string => !!c))].sort(),
    [cases.data, vendors.data],
  )
  if (cases.error) return <ErrorState error={cases.error} />
  if (cases.isLoading) return <Skeleton className="h-96" />
  return <DraftWorkspace categories={categories} currency={cases.data?.[0]?.currency || "USD"} />
}
