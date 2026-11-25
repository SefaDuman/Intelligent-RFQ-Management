import type { StoredRecord } from "@/data/sourcing-store"

/** Evaluators score each criterion 0 - 5. */
export const SCORE_MAX = 5
/** A must-pass criterion below this average disqualifies the bid. */
export const MIN_PASS_SCORE = 3

export interface EvalCriterion {
  id: string
  label: string
  description?: string
  /** Relative weight; normalised when scoring. */
  weight: number
  mustPass?: boolean
}

type Scores = Record<string, Record<string, Record<string, number>>>

export interface EvaluationRecord extends StoredRecord {
  caseId: string
  criteria: EvalCriterion[]
  /** Share of the combined score that comes from the technical evaluation (0 - 100). */
  technicalWeightPct: number
  /** evaluator -> vendor RFQ id -> criterion id -> score */
  scores: Scores
}

export const DEFAULT_CRITERIA: EvalCriterion[] = [
  { id: "fit", label: "Technical fit", description: "Meets the specification and requirements", weight: 35, mustPass: true },
  { id: "compliance", label: "Compliance & security", description: "Certifications, data protection, legal terms", weight: 20, mustPass: true },
  { id: "delivery-plan", label: "Delivery / implementation plan", description: "Credible plan, resources and timeline", weight: 20 },
  { id: "support", label: "Support & service levels", description: "SLAs, escalation and after-sales support", weight: 15 },
  { id: "references", label: "References & experience", description: "Comparable customers and track record", weight: 10 },
]

export function newEvaluation(company: string, caseId: string, criteria: EvalCriterion[] = DEFAULT_CRITERIA): EvaluationRecord {
  return {
    id: `${company.toLowerCase()}:${caseId}`,
    company,
    caseId,
    updatedAt: new Date().toISOString(),
    criteria: criteria.map((c) => ({ ...c })),
    technicalWeightPct: 30,
    scores: {},
  }
}

export const criteriaWeightTotal = (criteria: EvalCriterion[]) => criteria.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0)

/** Sets (or clears, when value is undefined) one evaluator's score. */
export function setScore(record: EvaluationRecord, evaluator: string, rfqId: string, criterionId: string, value: number | undefined): EvaluationRecord {
  const byVendor = { ...(record.scores[evaluator] ?? {}) }
  const byCriterion = { ...(byVendor[rfqId] ?? {}) }
  if (value === undefined || !Number.isFinite(value)) delete byCriterion[criterionId]
  else byCriterion[criterionId] = Math.min(SCORE_MAX, Math.max(0, value))
  byVendor[rfqId] = byCriterion
  return { ...record, scores: { ...record.scores, [evaluator]: byVendor } }
}

export interface TechnicalResult {
  rfqId: string
  /** 0 - 100, over the criteria that have at least one score. */
  score?: number
  answered: number
  total: number
  evaluators: number
  criterionAverages: Record<string, number | undefined>
  failedMustPass: string[]
}

export function technicalResults(record: EvaluationRecord, rfqIds: string[]): TechnicalResult[] {
  const evaluators = Object.keys(record.scores)
  return rfqIds.map((rfqId) => {
    const criterionAverages: Record<string, number | undefined> = {}
    const scoring = evaluators.filter((e) => Object.keys(record.scores[e]?.[rfqId] ?? {}).length > 0)
    for (const criterion of record.criteria) {
      const values = evaluators.map((e) => record.scores[e]?.[rfqId]?.[criterion.id]).filter((v): v is number => v !== undefined)
      criterionAverages[criterion.id] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined
    }
    const answeredCriteria = record.criteria.filter((c) => criterionAverages[c.id] !== undefined)
    const weight = answeredCriteria.reduce((s, c) => s + Math.max(0, c.weight), 0)
    const score = weight > 0
      ? answeredCriteria.reduce((s, c) => s + (criterionAverages[c.id]! / SCORE_MAX) * 100 * Math.max(0, c.weight), 0) / weight
      : undefined
    return {
      rfqId,
      score,
      answered: answeredCriteria.length,
      total: record.criteria.length,
      evaluators: scoring.length,
      criterionAverages,
      failedMustPass: record.criteria.filter((c) => c.mustPass && criterionAverages[c.id] !== undefined && criterionAverages[c.id]! < MIN_PASS_SCORE).map((c) => c.label),
    }
  })
}

export interface CombinedInput {
  rfqId: string
  vendorName: string
  /** 0 - 100 commercial score (price). */
  commercial: number
}

export interface CombinedResult extends CombinedInput {
  technical: TechnicalResult
  /** Weighted technical + commercial; undefined until at least one criterion is scored. */
  combined?: number
  disqualified: boolean
  /** True while some criteria are still unscored. */
  provisional: boolean
  rank?: number
}

/** Combines technical and commercial scores; disqualified and unscored bids are not ranked. */
export function combineScores(record: EvaluationRecord, inputs: CombinedInput[]): CombinedResult[] {
  const technical = technicalResults(record, inputs.map((i) => i.rfqId))
  const techShare = Math.min(100, Math.max(0, record.technicalWeightPct)) / 100
  const results = inputs.map((input, i): CombinedResult => {
    const tech = technical[i]
    return {
      ...input,
      technical: tech,
      combined: tech.score === undefined ? undefined : tech.score * techShare + input.commercial * (1 - techShare),
      disqualified: tech.failedMustPass.length > 0,
      provisional: tech.answered < tech.total,
    }
  })
  results
    .filter((r) => r.combined !== undefined && !r.disqualified)
    .sort((a, b) => b.combined! - a.combined!)
    .forEach((r, i) => (r.rank = i + 1))
  return results
}
