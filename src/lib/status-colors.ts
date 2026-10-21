import type { RfqStatus } from "@/domain/types"

export const STATUS_CHART_COLORS: Record<RfqStatus, string> = {
  Created: "oklch(0.7 0.02 264)",
  Sent: "oklch(0.68 0.14 230)",
  Received: "oklch(0.58 0.2 290)",
  Accepted: "oklch(0.65 0.16 155)",
  Rejected: "oklch(0.63 0.2 20)",
  Canceled: "oklch(0.8 0.01 264)",
  Declined: "oklch(0.63 0.2 20)",
  Removed: "oklch(0.8 0.01 264)",
}
