import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ClipboardCheck, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmptyState, SectionCard } from "@/components/app/page-parts"
import { VendorAvatar } from "@/components/rfq/rfq-badges"
import { useCompany } from "@/hooks/use-company"
import { useCurrentUser } from "@/hooks/use-rfq-data"
import { evaluationStore, useCollection } from "@/hooks/use-sourcing"
import { hasReplied, type RfqCaseDetail, type Vendor } from "@/domain/types"
import { compareReplies, WEIGHT_PRESETS } from "@/lib/comparison"
import { combineScores, criteriaWeightTotal, MIN_PASS_SCORE, newEvaluation, SCORE_MAX, setScore, type EvaluationRecord } from "@/lib/sourcing/evaluation"
import { EVENT_TEMPLATES } from "@/lib/sourcing/rfq-draft"
import { cn } from "@/lib/utils"

const fmt = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(1))

export function EvaluationPanel({ detail, vendors }: { detail: RfqCaseDetail; vendors: Vendor[] }) {
  const { company = "" } = useCompany()
  const { data: user } = useCurrentUser()
  const stored = useCollection(evaluationStore)
  const caseId = detail.header.rfqCaseId
  const record = stored.find((r) => r.caseId === caseId) ?? newEvaluation(company, caseId)
  const [evaluator, setEvaluator] = useState("")
  const who = evaluator.trim() || user?.fullName || "Evaluator"
  const [editing, setEditing] = useState(false)

  const bids = useMemo(() => detail.replies.filter((r) => hasReplied(r.status)), [detail.replies])
  const commercial = useMemo(() => {
    if (!bids.length) return new Map<string, number>()
    const result = compareReplies(detail.lines, bids, vendors, WEIGHT_PRESETS.balanced.weights)
    return new Map(result.metrics.map((m) => [m.reply.rfqId, m.scores.price]))
  }, [detail.lines, bids, vendors])

  const combined = useMemo(
    () => combineScores(record, bids.map((b) => ({ rfqId: b.rfqId, vendorName: b.vendorName, commercial: commercial.get(b.rfqId) ?? 0 }))),
    [record, bids, commercial],
  )

  const save = (next: EvaluationRecord) => {
    try {
      evaluationStore.upsert(next)
    } catch {
      toast.error("This browser could not save the scorecard.")
    }
  }

  if (!bids.length) {
    return <EmptyState icon={ClipboardCheck} title="No bids to evaluate yet" description="The scorecard opens as soon as vendors reply to this RFQ." />
  }

  const total = Math.round(criteriaWeightTotal(record.criteria))
  const patchCriterion = (id: string, patch: Partial<EvaluationRecord["criteria"][number]>) => save({ ...record, criteria: record.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  return (
    <div className="space-y-5">
      <SectionCard
        title="Evaluation scorecard"
        description={`Score each criterion 0–${SCORE_MAX}. Must-pass criteria below ${MIN_PASS_SCORE} disqualify a bid. Final score = technical + price (price scored from the quotes).`}
        action={<Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Edit criteria"}</Button>}
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="evaluator">Scoring as</Label>
            <Input id="evaluator" className="w-56" placeholder={user?.fullName || "Evaluator name"} value={evaluator} onChange={(e) => setEvaluator(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Scores from several evaluators are averaged. They are stored in this browser only.</p>
        </div>

        {editing && (
          <div className="mb-5 space-y-2 rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="eval-template" className="text-xs">Load criteria from</Label>
              <select id="eval-template" className="h-8 rounded-md border bg-background px-2 text-sm" value="" onChange={(e) => {
                const t = EVENT_TEMPLATES.find((x) => x.id === e.target.value)
                if (t) save({ ...record, criteria: t.criteria.map((c) => ({ ...c })), technicalWeightPct: t.technicalWeightPct })
              }}>
                <option value="">Template…</option>
                {EVENT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <Button size="sm" variant="outline" onClick={() => save({ ...record, criteria: [...record.criteria, { id: crypto.randomUUID(), label: "New criterion", weight: 0 }] })}><Plus /> Add</Button>
            </div>
            {record.criteria.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <Input aria-label={`Criterion ${i + 1} name`} className="min-w-48 flex-1" value={c.label} onChange={(e) => patchCriterion(c.id, { label: e.target.value })} />
                <Input aria-label={`Criterion ${i + 1} weight`} className="w-24" type="number" min={0} value={c.weight} onChange={(e) => patchCriterion(c.id, { weight: Number(e.target.value) })} />
                <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={!!c.mustPass} onCheckedChange={(v) => patchCriterion(c.id, { mustPass: v === true })} /> Must pass</label>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove criterion ${i + 1}`} onClick={() => save({ ...record, criteria: record.criteria.filter((x) => x.id !== c.id) })}><Trash2 /></Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={cn("tabular", total !== 100 && "text-amber-600 dark:text-amber-400")}>Weights total {total}</span>
              <Label htmlFor="eval-tech" className="ml-auto">Technical share</Label>
              <Input id="eval-tech" className="w-20" type="number" min={0} max={100} value={record.technicalWeightPct} onChange={(e) => save({ ...record, technicalWeightPct: Math.min(100, Math.max(0, Number(e.target.value))) })} />
              <span className="text-xs text-muted-foreground">% (price {100 - record.technicalWeightPct}%)</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">Criterion</th>
                {bids.map((b) => (
                  <th key={b.rfqId} className="px-2 py-2">
                    <div className="flex items-center gap-2"><VendorAvatar name={b.vendorName} id={b.vendorAccount} size="sm" /><span className="truncate font-medium">{b.vendorName}</span></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.criteria.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{c.label} <span className="text-xs font-normal text-muted-foreground">· {c.weight}%{c.mustPass ? " · must pass" : ""}</span></div>
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                  </td>
                  {bids.map((b) => {
                    const mine = record.scores[who]?.[b.rfqId]?.[c.id]
                    const avg = combined.find((r) => r.rfqId === b.rfqId)?.technical.criterionAverages[c.id]
                    return (
                      <td key={b.rfqId} className="px-2 py-2">
                        <select aria-label={`${c.label} score for ${b.vendorName}`} className="h-8 w-20 rounded-md border bg-background px-1 text-sm" value={mine ?? ""} onChange={(e) => save(setScore(record, who, b.rfqId, c.id, e.target.value === "" ? undefined : Number(e.target.value)))}>
                          <option value="">—</option>
                          {Array.from({ length: SCORE_MAX + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        {avg !== undefined && <span className={cn("ml-2 text-xs tabular", c.mustPass && avg < MIN_PASS_SCORE ? "text-destructive" : "text-muted-foreground")}>avg {avg.toFixed(1)}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr className="border-b"><td className="py-2 pr-3 text-muted-foreground">Technical score (0–100)</td>{combined.map((r) => <td key={r.rfqId} className="px-2 py-2 tabular">{fmt(r.technical.score)}</td>)}</tr>
              <tr className="border-b"><td className="py-2 pr-3 text-muted-foreground">Price score (0–100)</td>{combined.map((r) => <td key={r.rfqId} className="px-2 py-2 tabular">{fmt(r.commercial)}</td>)}</tr>
              <tr><td className="py-2 pr-3 font-semibold">Final score</td>{combined.map((r) => (
                <td key={r.rfqId} className="px-2 py-2">
                  <div className="font-semibold tabular">{fmt(r.combined)}{r.rank ? <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">#{r.rank}</span> : null}</div>
                  {r.disqualified && <div className="text-xs text-destructive">Disqualified: {r.technical.failedMustPass.join(", ")} below {MIN_PASS_SCORE}</div>}
                  {!r.disqualified && r.provisional && <div className="text-xs text-amber-600 dark:text-amber-400">{r.combined === undefined ? "Not scored" : `Provisional: ${r.technical.answered}/${r.technical.total} criteria`}</div>}
                </td>
              ))}</tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
