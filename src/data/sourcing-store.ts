export interface StoredRecord {
  id: string
  company: string
  updatedAt: string
}

type StorageLike = Pick<Storage, "getItem" | "setItem">

const EMPTY: never[] = []

/**
 * Browser-local collection for sourcing data (drafts, evaluations, rounds, clarifications, savings).
 * F&SC has no standard entity for these, so they live on the client like the invitation history.
 * Replace with custom Dataverse tables if the data must be shared across buyers.
 */
export class LocalCollection<T extends StoredRecord> {
  private readonly key: string
  private readonly storage: StorageLike
  private readonly listeners = new Set<() => void>()
  private cachedRaw: string | null | undefined
  private cached: T[] = EMPTY

  constructor(name: string, storage: StorageLike = localStorage) {
    this.key = `rfq-sourcing:${name}:v1`
    this.storage = storage
  }

  private parse(raw: string | null): T[] {
    if (!raw) return EMPTY
    try {
      const value: unknown = JSON.parse(raw)
      return Array.isArray(value)
        ? value.filter((r): r is T => !!r && typeof r === "object" && typeof r.id === "string" && typeof r.company === "string")
        : EMPTY
    } catch {
      return EMPTY
    }
  }

  /** Stable between writes so it can back useSyncExternalStore. */
  getSnapshot = (): T[] => {
    let raw: string | null = null
    try {
      raw = this.storage.getItem(this.key)
    } catch {
      return this.cached
    }
    if (raw !== this.cachedRaw) {
      this.cachedRaw = raw
      this.cached = this.parse(raw)
    }
    return this.cached
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    const onStorage = (event: StorageEvent) => {
      if (event.key === this.key) listener()
    }
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage)
    return () => {
      this.listeners.delete(listener)
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage)
    }
  }

  list(company?: string): T[] {
    const all = this.getSnapshot()
    const scoped = company ? all.filter((r) => r.company.toLowerCase() === company.toLowerCase()) : all
    return [...scoped].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): T | undefined {
    return this.getSnapshot().find((r) => r.id === id)
  }

  upsert(record: T): T {
    const next = { ...record, updatedAt: new Date().toISOString() }
    this.write([next, ...this.getSnapshot().filter((r) => r.id !== record.id)])
    return next
  }

  remove(id: string) {
    this.write(this.getSnapshot().filter((r) => r.id !== id))
  }

  private write(records: T[]) {
    const serialized = JSON.stringify(records.slice(0, 2000))
    this.storage.setItem(this.key, serialized)
    this.cachedRaw = undefined
    this.listeners.forEach((listener) => listener())
  }
}
