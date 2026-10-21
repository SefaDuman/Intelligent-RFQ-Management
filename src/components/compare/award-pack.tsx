import { useEffect, useState } from "react"
import { Download, FileCheck2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { RfqCaseDetail, Vendor } from "@/domain/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useCurrentUser } from "@/hooks/use-rfq-data"
import { awardEvidenceKey, buildAwardPack } from "@/lib/award-pack"
import { downloadText, type Weights } from "@/lib/comparison"

export function AwardPackPanel({ detail, selectedIds, vendors, weights, reload }: {
  detail: RfqCaseDetail
  selectedIds: string[]
  vendors: Vendor[]
  weights: Weights
  reload: () => Promise<RfqCaseDetail>
}) {
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [preferredId, setPreferredId] = useState("")
  const [rationale, setRationale] = useState("")
  const [name, setName] = useState<string>()
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [pack, setPack] = useState<ReturnType<typeof buildAwardPack>>()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  const input = { detail, selectedIds, vendors, weights, preferredId, rationale, preparedBy: name ?? user.data?.fullName ?? "", reviewed }
  let currentKey: string | undefined
  let validationError: string | undefined
  try { currentKey = awardEvidenceKey(input, now) } catch (cause) {
    validationError = cause instanceof Error ? cause.message : "Unable to validate the comparison evidence."
  }
  const stale = !!pack && pack.evidenceKey !== currentKey
  const prepare = async (download = false) => {
    setBusy(true)
    setError(undefined)
    try {
      const checkedAt = new Date()
      const latest = await reload()
      const latestInput = { ...input, detail: latest }
      if (awardEvidenceKey(latestInput, checkedAt) !== awardEvidenceKey(input, checkedAt)) {
        throw new Error("Source data changed during verification. The comparison has been refreshed; review it and prepare the pack again.")
      }
      const next = buildAwardPack(latestInput, checkedAt)
      if (download) {
        if (!pack || next.evidenceKey !== pack.evidenceKey) throw new Error("The pack is stale. Prepare and review an updated preview before downloading.")
        downloadText(pack.fileName, pack.html, "text/html;charset=utf-8")
        toast.success("Award recommendation pack downloaded")
      } else setPack(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare the award recommendation pack.")
    } finally { setBusy(false) }
  }
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><FileCheck2 /> Award recommendation pack</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Award recommendation pack</DialogTitle><DialogDescription>{detail.header.company.toUpperCase()} / {detail.header.rfqCaseId} · A downloadable buyer-reviewed memo, not an approval or ERP award.</DialogDescription></DialogHeader>
        <p className="text-sm text-muted-foreground">Includes selected bids, weighted criteria, buyer rationale, unresolved risks and source evidence. Source RFQ data is rechecked before preparation and download. No external AI call is required.</p>
        <fieldset disabled={busy} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="award-vendor">Preferred offer</Label><select id="award-vendor" value={preferredId} onChange={(event) => { setPreferredId(event.target.value); setReviewed(false) }} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Choose an offer</option>{detail.replies.filter((reply) => selectedIds.includes(reply.rfqId)).map((reply) => <option key={reply.rfqId} value={reply.rfqId}>{reply.vendorName} / {reply.rfqId}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="award-preparer">Prepared by</Label><Input id="award-preparer" value={input.preparedBy} maxLength={200} onChange={(event) => setName(event.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="award-rationale">Buyer rationale and conditions</Label><Textarea id="award-rationale" value={rationale} maxLength={5000} rows={3} placeholder="Explain the preference, trade-offs, any departure from the ranking, and conditions to resolve before award." onChange={(event) => { setRationale(event.target.value); setReviewed(false) }} /></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1" />I reviewed the selected offers and will review all unresolved risks in the preview. This does not approve or execute an award.</label>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { void prepare() }} disabled={busy || !reviewed || !preferredId || !rationale.trim() || !input.preparedBy.trim()}>{busy ? <Loader2 className="animate-spin" /> : <FileCheck2 />}Prepare preview</Button>
          <Button variant="outline" disabled={busy || !pack || stale} onClick={() => { void prepare(true) }}><Download /> Download HTML memo</Button>
        </div>
        {busy && <p role="status" className="text-sm">Verifying current source data...</p>}
        {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
        {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
        {stale && <p role="alert" className="rounded-lg border border-amber-500 p-3 text-sm">Comparison, buyer inputs or date changed. Prepare a new preview before exporting.</p>}
        {pack && !stale && <><p className="text-xs text-muted-foreground">Review this preview before downloading. Open the downloaded HTML in a browser to print or save as PDF. This is a point-in-time file, not a shared approval record.</p><iframe title="Award recommendation preview" srcDoc={pack.html} sandbox="" className="min-h-[420px] w-full rounded-lg border bg-white" /></>}
      </DialogContent>
    </Dialog>
  </>
}
