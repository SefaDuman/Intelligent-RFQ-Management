import { getContext } from "@microsoft/power-apps/app"
import { appConfig } from "@/config/app-config"
import type { CurrentUser } from "@/domain/types"
import type { DataContext, EmailService, RfqRepository } from "./types"
import { LocalInvitationStore, SimulatedEmailService } from "./local-services"
import { SampleRepository } from "./sample/sample-repository"
import { discoverTableServices, findOutlookService, hasAllTableServices } from "./dataverse/discover"
import { DataverseRepository } from "./dataverse/dataverse-repository"
import { OutlookEmailService } from "./dataverse/outlook-email"

async function loadCurrentUser(): Promise<CurrentUser> {
  const fallback: CurrentUser = { fullName: "" }
  try {
    const context = await Promise.race([
      getContext(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
    ])
    return {
      fullName: context.user.fullName || context.user.userPrincipalName || fallback.fullName,
      email: context.user.userPrincipalName,
    }
  } catch {
    return fallback
  }
}

async function createDataContext(): Promise<DataContext> {
  const diagnostics: string[] = []

  const outlook = await findOutlookService()
  const email: EmailService = outlook ? new OutlookEmailService(outlook) : new SimulatedEmailService()
  diagnostics.push(
    outlook
      ? "E-mail: Office 365 Outlook connector (SendEmailV2)."
      : "E-mail: simulated. Add the Office 365 Outlook connector to send real invitations.",
  )

  let repository: RfqRepository | undefined
  let seedInvitations: SampleRepository["seedInvitations"] = []

  if (appConfig.dataMode !== "sample") {
    const { services, missing } = await discoverTableServices()
    if (hasAllTableServices(services)) {
      repository = new DataverseRepository(services)
      diagnostics.push("Data: Dynamics 365 F&SC via Dataverse virtual tables.")
    } else if (appConfig.dataMode === "dataverse") {
      throw new Error(
        `Data mode is "dataverse" but these virtual tables aren't added to the app: ${missing.join(", ")}. ` +
          "Run `pa app add data-source --connector dataverse --table <name>` for each, or check src/config/dataverse-schema.ts.",
      )
    } else {
      diagnostics.push(`Data: sample data. Missing generated services for ${missing.join(", ")}.`)
    }
  }

  if (!repository) {
    const sample = new SampleRepository()
    seedInvitations = sample.seedInvitations
    repository = sample
    if (appConfig.dataMode === "sample") diagnostics.push("Data: sample data (VITE_RFQ_DATA_MODE=sample).")
  }

  let userPromise: Promise<CurrentUser> | undefined
  return {
    repository,
    email,
    invitations: new LocalInvitationStore(`rfq-invitations:${repository.kind}`, seedInvitations),
    getCurrentUser: () => (userPromise ??= loadCurrentUser()),
    diagnostics,
  }
}

let contextPromise: Promise<DataContext> | undefined

export function getDataContext(): Promise<DataContext> {
  return (contextPromise ??= createDataContext())
}
