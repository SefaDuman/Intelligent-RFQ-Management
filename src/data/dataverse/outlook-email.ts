import type { EmailService } from "@/data/types"
import type { OutlookService } from "./discover"

/** Sends e-mail through the Office 365 Outlook connector (SendEmailV2). */
export class OutlookEmailService implements EmailService {
  readonly channel = "outlook" as const
  private readonly outlook: OutlookService

  constructor(outlook: OutlookService) {
    this.outlook = outlook
  }

  async send(message: { to: string; subject: string; html: string; cc?: string }): Promise<void> {
    const result = await this.outlook.SendEmailV2({
      To: message.to,
      Subject: message.subject,
      Body: message.html,
      Cc: message.cc || undefined,
      Importance: "Normal",
    })
    if (!result || result.success !== true) {
      const error = result?.error instanceof Error ? result.error.message : String(result?.error ?? "Outlook did not confirm acceptance; delivery is uncertain.")
      throw new Error(error)
    }
  }
}
