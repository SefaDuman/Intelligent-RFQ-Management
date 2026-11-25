import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { VendorAvatar } from "@/components/rfq/rfq-badges"
import type { RfqCase, RfqReply, Vendor } from "@/domain/types"
import type { DraftSupplier } from "@/lib/sourcing/rfq-draft"
import { rankSuppliers, recommendShortlist } from "@/lib/sourcing/supplier-shortlist"
import { cn } from "@/lib/utils"

const PAGE = 8

export function SupplierShortlist({
  vendors,
  cases,
  replies,
  category,
  selected,
  onChange,
}: {
  vendors: Vendor[]
  cases: RfqCase[]
  replies: RfqReply[]
  category?: string
  selected: DraftSupplier[]
  onChange: (next: DraftSupplier[]) => void
}) {
  const [search, setSearch] = useState("")
  const [showAll, setShowAll] = useState(false)
  const ranked = useMemo(() => rankSuppliers({ vendors, cases, replies, category }), [vendors, cases, replies, category])
  const chosen = new Set(selected.map((s) => s.accountNumber))
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ranked.filter((r) => !q || [r.vendor.name, r.vendor.accountNumber, r.vendor.vendorGroup].some((f) => f?.toLowerCase().includes(q)))
  }, [ranked, search])
  const visible = showAll || search ? filtered : filtered.slice(0, PAGE)

  const toggle = (vendor: Vendor) =>
    onChange(chosen.has(vendor.accountNumber)
      ? selected.filter((s) => s.accountNumber !== vendor.accountNumber)
      : [...selected, { accountNumber: vendor.accountNumber, name: vendor.name, email: vendor.email }])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors" className="pl-9" aria-label="Search vendors" />
        </div>
        <Button type="button" variant="outline" onClick={() => onChange(recommendShortlist(ranked).map((r) => ({ accountNumber: r.vendor.accountNumber, name: r.vendor.name, email: r.vendor.email })))}>
          Select top 5
        </Button>
        <Button type="button" variant="ghost" disabled={!selected.length} onClick={() => onChange([])}>Clear</Button>
      </div>
      {!category && <p className="text-xs text-muted-foreground">Choose a procurement category to score category fit.</p>}
      <ul className="space-y-1.5">
        {visible.map(({ vendor, score, reasons, warnings }) => (
          <li key={vendor.accountNumber}>
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-colors", chosen.has(vendor.accountNumber) ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50")}>
              <Checkbox className="mt-1" checked={chosen.has(vendor.accountNumber)} onCheckedChange={() => toggle(vendor)} />
              <VendorAvatar name={vendor.name} id={vendor.accountNumber} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{vendor.name}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular">Fit {Math.round(score)}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{vendor.accountNumber} · {vendor.email ?? "No e-mail"}{vendor.vendorGroup && ` · ${vendor.vendorGroup}`}</div>
                {(reasons.length > 0 || warnings.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {reasons.map((r) => <span key={r} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">{r}</span>)}
                    {warnings.map((w) => <span key={w} className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">{w}</span>)}
                  </div>
                )}
              </div>
            </label>
          </li>
        ))}
        {!visible.length && <li className="p-4 text-center text-sm text-muted-foreground">No vendors match.</li>}
      </ul>
      {!search && filtered.length > PAGE && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show top vendors only" : `Show all ${filtered.length} vendors`}
        </Button>
      )}
    </div>
  )
}
