import type { Invitation } from "@/domain/types"
import type { EmailService, InvitationStore } from "@/data/types"

/**
 * Keeps the invitation history in localStorage. F&SC has no standard entity
 * for app-sent e-mail invitations, so the log lives on the client. Replace
 * with a custom Dataverse table if the history must be shared across users.
 */
export class LocalInvitationStore implements InvitationStore {
  private readonly storageKey: string
  private readonly seed: Invitation[]

  constructor(storageKey: string, seed: Invitation[] = []) {
    this.storageKey = storageKey
    this.seed = seed
  }

  private read(): Invitation[] {
    try {
      const raw = localStorage.getItem(this.storageKey)
      return raw ? (JSON.parse(raw) as Invitation[]) : []
    } catch {
      return []
    }
  }

  async list(rfqCaseId?: string): Promise<Invitation[]> {
    const all = [...this.read(), ...this.seed]
    const filtered = rfqCaseId ? all.filter((i) => i.rfqCaseId === rfqCaseId) : all
    return filtered.sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  }

  async add(invitations: Invitation[]): Promise<void> {
    const next = [...invitations, ...this.read()].slice(0, 1000)
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(next))
    } catch {
      // Storage may be unavailable (private mode / quota); history is best-effort.
    }
  }
}

/** Used when the Office 365 Outlook connector isn't added to the app. */
export class SimulatedEmailService implements EmailService {
  readonly channel = "simulated" as const

  async send(message: { to: string; subject: string }): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 350))
    console.info(`[simulated e-mail] to=${message.to} subject=${message.subject}`)
  }
}
