import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CRITERIA, WEIGHT_PRESETS, type Weights } from "@/lib/comparison"
import { cn } from "@/lib/utils"

export function ScoreRing({ score, size = 64, color = "var(--primary)", label }: { score: number; size?: number; color?: string; label?: string }) {
  const r = 15.5
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, score))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="-rotate-90" style={{ width: size, height: size }}>
        <circle cx="18" cy="18" r={r} fill="none" className="stroke-muted" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          style={{ transition: "stroke-dasharray 600ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-semibold tabular" style={{ fontSize: size * 0.28 }}>
          {Math.round(clamped)}
        </span>
        {label && <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>}
      </div>
    </div>
  )
}

export function WeightsPanel({ weights, onChange }: { weights: Weights; onChange: (weights: Weights) => void }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1
  const activePreset = Object.entries(WEIGHT_PRESETS).find(([, p]) => CRITERIA.every((c) => p.weights[c.key] === weights[c.key]))?.[0]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal /> Scoring weights
          {activePreset && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{WEIGHT_PRESETS[activePreset].label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="text-sm font-semibold">Scoring weights</div>
        <p className="mt-0.5 text-xs text-muted-foreground">Tune how offers are ranked. Scores update instantly.</p>
        <div className="mt-3 grid grid-cols-4 gap-1">
          {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...preset.weights })}
              className={cn(
                "rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
                activePreset === key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {CRITERIA.map((c) => (
            <div key={c.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium" title={c.description}>
                  {c.label}
                </span>
                <span className="tabular text-muted-foreground">{Math.round((weights[c.key] / total) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[c.key]}
                onChange={(e) => onChange({ ...weights, [c.key]: Number(e.target.value) })}
                className="mt-1 h-1.5 w-full cursor-pointer accent-[var(--primary)]"
                aria-label={`${c.label} weight`}
              />
              <div className="text-[10px] text-muted-foreground">{c.description}</div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
