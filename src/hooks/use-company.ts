import { create } from "zustand"
import { appConfig } from "@/config/app-config"

export const useCompany = create<{
  company: string | undefined
  setCompany: (company: string) => void
}>((set) => ({
  company: appConfig.company?.toLowerCase(),
  setCompany: (company) => set({ company: company.toLowerCase() }),
}))
