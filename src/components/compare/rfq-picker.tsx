import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, FileSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { hasReplied, isOpenStatus, type RfqCase, type RfqReply } from "@/domain/types"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/rfq/rfq-badges"

export function RfqPicker({
  cases,
  replies,
  value,
  onChange,
}: {
  cases: RfqCase[]
  replies: RfqReply[]
  value?: string
  onChange: (rfqCaseId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const replyCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of replies) if (hasReplied(r.status)) map.set(r.rfqCaseId, (map.get(r.rfqCaseId) ?? 0) + 1)
    return map
  }, [replies])

  const options = useMemo(
    () =>
      cases
        .map((c) => ({ rfq: c, replies: replyCount.get(c.rfqCaseId) ?? 0 }))
        .filter((o) => o.replies > 0)
        .sort((a, b) => Number(isOpenStatus(b.rfq.status)) - Number(isOpenStatus(a.rfq.status)) || b.replies - a.replies),
    [cases, replyCount],
  )
  const current = cases.find((c) => c.rfqCaseId === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between md:w-[380px]">
          <span className="flex min-w-0 items-center gap-2">
            <FileSearch className="text-muted-foreground" />
            {current ? (
              <span className="truncate">
                <span className="font-mono text-xs text-muted-foreground">{current.rfqCaseId}</span> {current.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Select an RFQ to compare…</span>
            )}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[380px] p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search RFQ number or name…" />
          <CommandList>
            <CommandEmpty>No RFQs with replies found.</CommandEmpty>
            {(["open", "closed"] as const).map((group) => {
              const items = options.filter((o) => isOpenStatus(o.rfq.status) === (group === "open"))
              if (!items.length) return null
              return (
                <CommandGroup key={group} heading={group === "open" ? "Open RFQs" : "Closed RFQs"}>
                  {items.map(({ rfq, replies: count }) => (
                    <CommandItem
                      key={rfq.rfqCaseId}
                      value={`${rfq.rfqCaseId} ${rfq.name} ${rfq.procurementCategory ?? ""}`}
                      onSelect={() => {
                        onChange(rfq.rfqCaseId)
                        setOpen(false)
                      }}
                      className="gap-3"
                    >
                      <Check className={cn("size-4", value === rfq.rfqCaseId ? "opacity-100" : "opacity-0")} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{rfq.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {rfq.rfqCaseId} · {count} repl{count === 1 ? "y" : "ies"}
                        </div>
                      </div>
                      <StatusBadge status={rfq.status} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
