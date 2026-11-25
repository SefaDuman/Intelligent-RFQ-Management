import { useMemo, useSyncExternalStore } from "react"
import { LocalCollection, type StoredRecord } from "@/data/sourcing-store"
import type { Clarification } from "@/lib/sourcing/clarifications"
import type { EvaluationRecord } from "@/lib/sourcing/evaluation"
import type { NegotiationRound } from "@/lib/sourcing/negotiation"
import type { RfqDraft } from "@/lib/sourcing/rfq-draft"
import type { SavingsInitiative } from "@/lib/sourcing/savings"
import { useCompany } from "./use-company"

export const draftStore = new LocalCollection<RfqDraft>("drafts")
export const evaluationStore = new LocalCollection<EvaluationRecord>("evaluations")
export const roundStore = new LocalCollection<NegotiationRound>("negotiation-rounds")
export const clarificationStore = new LocalCollection<Clarification>("clarifications")
export const initiativeStore = new LocalCollection<SavingsInitiative>("savings-initiatives")

/** Live, company-scoped view of a browser-local collection. */
export function useCollection<T extends StoredRecord>(store: LocalCollection<T>) {
  const { company } = useCompany()
  const all = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return useMemo(
    () => all.filter((r) => r.company.toLowerCase() === company?.toLowerCase()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [all, company],
  )
}
