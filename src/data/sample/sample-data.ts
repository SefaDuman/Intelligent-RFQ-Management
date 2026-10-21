import { addDays, formatISO, startOfDay, subDays } from "date-fns"
import type { Invitation, RfqCase, RfqCaseLine, RfqReply, RfqReplyLine, RfqStatus, Vendor } from "@/domain/types"

/** Small seeded PRNG so the sample data is stable between reloads. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface VendorProfile extends Vendor {
  categories: string[]
  priceFactor: number
  responsiveness: number
  leadTimeBase: number
  paymentTerms: string
  deliveryTerms: string
}

const VENDORS: VendorProfile[] = [
  { accountNumber: "V-1001", name: "Contoso Components Ltd.", email: "quotes@contoso-components.example.com", vendorGroup: "Electronics", rating: 4.6, onTimeDeliveryPct: 96, city: "Seattle", country: "USA", categories: ["Electronics", "IT hardware"], priceFactor: 1.04, responsiveness: 0.95, leadTimeBase: 12, paymentTerms: "Net 45", deliveryTerms: "DAP" },
  { accountNumber: "V-1002", name: "Fabrikam Industrial Supply", email: "sales@fabrikam-industrial.example.com", vendorGroup: "MRO", rating: 4.2, onTimeDeliveryPct: 91, city: "Chicago", country: "USA", categories: ["MRO", "Chemicals", "Packaging"], priceFactor: 0.97, responsiveness: 0.85, leadTimeBase: 8, paymentTerms: "Net 30", deliveryTerms: "FOB" },
  { accountNumber: "V-1003", name: "Northwind Metals", email: "rfq@northwind-metals.example.com", vendorGroup: "Raw materials", rating: 4.4, onTimeDeliveryPct: 93, city: "Pittsburgh", country: "USA", categories: ["Raw materials"], priceFactor: 1.0, responsiveness: 0.9, leadTimeBase: 18, paymentTerms: "Net 60", deliveryTerms: "CIF" },
  { accountNumber: "V-1004", name: "Litware Packaging Co.", email: "bids@litware-pack.example.com", vendorGroup: "Packaging", rating: 3.9, onTimeDeliveryPct: 88, city: "Atlanta", country: "USA", categories: ["Packaging"], priceFactor: 0.92, responsiveness: 0.8, leadTimeBase: 6, paymentTerms: "Net 30", deliveryTerms: "EXW" },
  { accountNumber: "V-1005", name: "Tailspin Electronics", email: "quotes@tailspin-electronics.example.com", vendorGroup: "Electronics", rating: 4.0, onTimeDeliveryPct: 86, city: "Shenzhen", country: "CHN", categories: ["Electronics"], priceFactor: 0.86, responsiveness: 0.75, leadTimeBase: 28, paymentTerms: "2% 10 Net 30", deliveryTerms: "FOB" },
  { accountNumber: "V-1006", name: "Wide World Importers", email: "procurement@wideworld.example.com", vendorGroup: "General", rating: 3.7, onTimeDeliveryPct: 82, city: "Rotterdam", country: "NLD", categories: ["Packaging", "MRO", "Raw materials", "Chemicals"], priceFactor: 0.94, responsiveness: 0.7, leadTimeBase: 21, paymentTerms: "Net 60", deliveryTerms: "CIF" },
  { accountNumber: "V-1007", name: "Proseware Plastics", email: "sales@proseware-plastics.example.com", vendorGroup: "Packaging", rating: 4.1, onTimeDeliveryPct: 90, city: "Monterrey", country: "MEX", categories: ["Packaging", "Chemicals"], priceFactor: 0.95, responsiveness: 0.82, leadTimeBase: 10, paymentTerms: "Net 45", deliveryTerms: "DAP" },
  { accountNumber: "V-1008", name: "Woodgrove Fasteners", email: "rfq@woodgrove-fasteners.example.com", vendorGroup: "MRO", rating: 4.5, onTimeDeliveryPct: 97, city: "Detroit", country: "USA", categories: ["MRO", "Raw materials"], priceFactor: 1.06, responsiveness: 0.92, leadTimeBase: 5, paymentTerms: "Net 30", deliveryTerms: "DAP" },
  { accountNumber: "V-1009", name: "Coho Chemicals", email: "orders@coho-chem.example.com", vendorGroup: "Chemicals", rating: 4.3, onTimeDeliveryPct: 94, city: "Houston", country: "USA", categories: ["Chemicals"], priceFactor: 1.01, responsiveness: 0.88, leadTimeBase: 9, paymentTerms: "Net 45", deliveryTerms: "FOB" },
  { accountNumber: "V-1010", name: "Lucerne Precision Parts", email: "quotes@lucerne-precision.example.com", vendorGroup: "Raw materials", rating: 4.8, onTimeDeliveryPct: 98, city: "Lucerne", country: "CHE", categories: ["Raw materials", "Electronics", "MRO"], priceFactor: 1.15, responsiveness: 0.93, leadTimeBase: 14, paymentTerms: "Net 30", deliveryTerms: "DAP" },
  { accountNumber: "V-1011", name: "Trey Research Instruments", email: "bids@treyresearch.example.com", vendorGroup: "IT hardware", rating: 4.0, onTimeDeliveryPct: 89, city: "Austin", country: "USA", categories: ["IT hardware", "Electronics"], priceFactor: 0.98, responsiveness: 0.78, leadTimeBase: 11, paymentTerms: "Net 30", deliveryTerms: "DAP" },
  { accountNumber: "V-1012", name: "Adventure Works Supply", email: "sales@adventureworks-supply.example.com", vendorGroup: "IT hardware", rating: 4.4, onTimeDeliveryPct: 92, city: "Toronto", country: "CAN", categories: ["IT hardware", "MRO"], priceFactor: 1.02, responsiveness: 0.86, leadTimeBase: 7, paymentTerms: "Net 45", deliveryTerms: "FOB" },
]

interface CatalogItem {
  itemNumber: string
  name: string
  unit: string
  price: number
  qty: [number, number]
}

const CATALOG: Record<string, CatalogItem[]> = {
  Electronics: [
    { itemNumber: "PCB-210", name: "Controller board PCB assembly", unit: "ea", price: 48.5, qty: [200, 1500] },
    { itemNumber: "CAP-100UF", name: "Capacitor 100µF 50V", unit: "ea", price: 0.18, qty: [10000, 60000] },
    { itemNumber: "RES-10K", name: "Resistor 10kΩ 0603", unit: "ea", price: 0.02, qty: [20000, 100000] },
    { itemNumber: "CONN-USBC", name: "USB-C receptacle connector", unit: "ea", price: 0.65, qty: [2000, 12000] },
    { itemNumber: "LCD-7IN", name: "7\" TFT display module", unit: "ea", price: 22.4, qty: [150, 900] },
  ],
  "Raw materials": [
    { itemNumber: "AL-6061-SH", name: "Aluminium sheet 6061-T6 2mm", unit: "kg", price: 4.1, qty: [2000, 12000] },
    { itemNumber: "SS-304-ROD", name: "Stainless steel rod 304 Ø20", unit: "m", price: 9.8, qty: [500, 4000] },
    { itemNumber: "CU-WIRE-25", name: "Copper wire 2.5mm²", unit: "m", price: 0.92, qty: [5000, 30000] },
    { itemNumber: "STL-PLT-10", name: "Steel plate S355 10mm", unit: "kg", price: 1.35, qty: [3000, 20000] },
  ],
  Packaging: [
    { itemNumber: "BOX-403030", name: "Corrugated box 40x30x30", unit: "ea", price: 0.84, qty: [5000, 40000] },
    { itemNumber: "PLT-EUR", name: "EUR pallet 1200x800", unit: "ea", price: 11.5, qty: [300, 2500] },
    { itemNumber: "FOAM-INS", name: "PE foam insert custom", unit: "ea", price: 0.46, qty: [5000, 30000] },
    { itemNumber: "TAPE-48", name: "Packing tape 48mm x 66m", unit: "roll", price: 1.1, qty: [1000, 8000] },
  ],
  MRO: [
    { itemNumber: "BRG-6204", name: "Ball bearing 6204-2RS", unit: "ea", price: 3.2, qty: [200, 2000] },
    { itemNumber: "LUB-EP2", name: "Grease EP2 18kg pail", unit: "ea", price: 64, qty: [20, 150] },
    { itemNumber: "GLV-NIT", name: "Nitrile gloves (box of 100)", unit: "box", price: 6.9, qty: [300, 3000] },
    { itemNumber: "FLT-HYD", name: "Hydraulic return filter", unit: "ea", price: 38, qty: [40, 400] },
  ],
  "IT hardware": [
    { itemNumber: "LAP-14P", name: "Laptop 14\" Pro, 32GB", unit: "ea", price: 1380, qty: [20, 180] },
    { itemNumber: "MON-27-4K", name: "Monitor 27\" 4K USB-C", unit: "ea", price: 329, qty: [30, 250] },
    { itemNumber: "DOCK-USBC", name: "USB-C docking station", unit: "ea", price: 189, qty: [30, 250] },
    { itemNumber: "SW-24P", name: "Managed switch 24-port PoE", unit: "ea", price: 640, qty: [4, 40] },
  ],
  Chemicals: [
    { itemNumber: "IPA-99-20", name: "Isopropyl alcohol 99% 20L", unit: "drum", price: 58, qty: [40, 400] },
    { itemNumber: "EPX-2K", name: "Structural epoxy 2K 400ml", unit: "ea", price: 21.5, qty: [200, 1500] },
    { itemNumber: "CLN-ALK", name: "Alkaline cleaner 25L", unit: "drum", price: 46, qty: [30, 300] },
  ],
}

const CASE_TITLES: Record<string, string[]> = {
  Electronics: ["Controller board components", "Display module sourcing", "Passive components – annual", "Connector program"],
  "Raw materials": ["Aluminium sheet supply", "Stainless bar stock", "Copper wire framework", "Steel plate – plant 2"],
  Packaging: ["Outbound packaging 2027", "Pallet supply agreement", "Protective packaging refresh"],
  MRO: ["Maintenance spares – line 3", "Bearings & lubricants", "Safety consumables"],
  "IT hardware": ["Laptop refresh wave", "Office monitors & docks", "Network upgrade – DC"],
  Chemicals: ["Cleaning chemicals", "Adhesives & epoxies"],
}

const REQUESTERS = ["Alicia Thomber", "Charlie Carson", "Julia Funderburk", "Kevin Cook", "Sara Thomas", "Ahmed Barnes"]
const CATEGORIES = Object.keys(CATALOG)

const iso = (d: Date) => formatISO(d)

export interface SampleDataset {
  vendors: Vendor[]
  cases: RfqCase[]
  caseLines: RfqCaseLine[]
  replies: RfqReply[]
  invitations: Invitation[]
}

export function generateSampleData(today = startOfDay(new Date())): SampleDataset {
  const rand = mulberry32(20261008)
  const between = (min: number, max: number) => min + rand() * (max - min)
  const int = (min: number, max: number) => Math.floor(between(min, max + 1))
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]
  const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

  const cases: RfqCase[] = []
  const caseLines: RfqCaseLine[] = []
  const replies: RfqReply[] = []
  const invitations: Invitation[] = []

  const CASE_COUNT = 28
  let rfqSeq = 4100

  for (let i = 0; i < CASE_COUNT; i++) {
    // Spread cases over ~6 months; the first ones are the most recent.
    const forcedDemo = i >= 1 && i <= 4
    const ageDays = forcedDemo ? 9 + i * 2 : i < 10 ? int(1, 18) + i : Math.round(18 + (i - 10) * 9 + between(0, 6))
    const created = subDays(today, ageDays)
    const category = i < 6 ? CATEGORIES[i % CATEGORIES.length] : pick(CATEGORIES)
    const caseId = `RFQC-${String(1240 - i).padStart(6, "0")}`
    const expiry = addDays(created, forcedDemo ? ageDays + int(3, 12) : int(12, 28))

    let status: RfqStatus
    if (ageDays <= 3) status = rand() < 0.5 ? "Created" : "Sent"
    else if (ageDays <= 30) status = rand() < 0.75 ? "Received" : "Sent"
    else if (ageDays <= 50) status = rand() < 0.5 ? "Received" : "Accepted"
    else status = rand() < 0.12 ? "Canceled" : rand() < 0.1 ? "Rejected" : "Accepted"
    // Make sure the first few cases are great for comparison demos.
    if (forcedDemo) status = "Received"

    const catalog = CATALOG[category]
    const lineCount = Math.min(catalog.length, int(2, 5))
    const items = [...catalog].sort(() => rand() - 0.5).slice(0, lineCount)
    const reqDelivery = addDays(expiry, int(14, 45))
    const lines: RfqCaseLine[] = items.map((item, idx) => ({
      recordId: `${caseId}-L${idx + 1}`,
      rfqCaseId: caseId,
      lineNumber: idx + 1,
      itemNumber: item.itemNumber,
      itemName: item.name,
      quantity: Math.round(between(item.qty[0], item.qty[1]) / 10) * 10 || item.qty[0],
      unit: item.unit,
      procurementCategory: category,
      requestedDeliveryDate: iso(reqDelivery),
      targetUnitPrice: item.price,
    }))
    caseLines.push(...lines)

    cases.push({
      recordId: caseId,
      rfqCaseId: caseId,
      name: pick(CASE_TITLES[category]),
      status,
      company: "USMF",
      currency: "USD",
      procurementCategory: category,
      requester: pick(REQUESTERS),
      createdDate: iso(created),
      expiryDate: iso(expiry),
      requestedDeliveryDate: iso(reqDelivery),
      deliveryTerms: pick(["DAP", "FOB", "CIF"]),
    })

    const matching = VENDORS.filter((v) => v.categories.includes(category))
    const others = VENDORS.filter((v) => !v.categories.includes(category))
    const invitedCount = Math.min(matching.length + 1, int(3, 5))
    const invited = [...matching.sort(() => rand() - 0.5), ...others.sort(() => rand() - 0.5)].slice(0, invitedCount)

    const caseReplies: RfqReply[] = invited.map((vendor) => {
      const rfqId = `RFQ-${String(rfqSeq++).padStart(6, "0")}`
      const sent = addDays(created, int(0, 1))
      let replyStatus: RfqStatus = status === "Created" ? "Created" : "Sent"
      let replyDate: Date | undefined
      if (status !== "Created") {
        const responds = rand() < vendor.responsiveness || forcedDemo
        const candidate = addDays(sent, int(1, forcedDemo ? 7 : 9))
        if (responds && candidate <= today && status !== "Sent") {
          replyStatus = "Received"
          replyDate = candidate
        }
      }
      if (status === "Canceled") replyStatus = "Canceled"

      const replyLines: RfqReplyLine[] = lines.map((line) => {
        const quoted = rand() > 0.07
        const unitPrice = round((line.targetUnitPrice ?? 1) * vendor.priceFactor * between(0.9, 1.12), line.targetUnitPrice! < 1 ? 4 : 2)
        const discountPct = pick([0, 0, 0, 2, 3, 5])
        const leadTimeDays = Math.max(2, Math.round(vendor.leadTimeBase * between(0.75, 1.35)))
        return {
          recordId: `${rfqId}-L${line.lineNumber}`,
          rfqId,
          lineNumber: line.lineNumber,
          itemNumber: line.itemNumber,
          quantity: line.quantity,
          unitPrice: quoted ? unitPrice : 0,
          discountPct: quoted ? discountPct : 0,
          netAmount: quoted ? round(line.quantity * unitPrice * (1 - discountPct / 100)) : 0,
          leadTimeDays: quoted ? leadTimeDays : undefined,
          deliveryDate: quoted && replyDate ? iso(addDays(replyDate, leadTimeDays)) : undefined,
          quoted,
        }
      })

      const hasReply = replyStatus === "Received"
      const totalAmount = hasReply ? round(replyLines.reduce((s, l) => s + l.netAmount, 0)) : undefined
      const maxLead = Math.max(...replyLines.map((l) => l.leadTimeDays ?? 0))

      if (status !== "Created") {
        invitations.push({
          id: `INV-${rfqId}`,
          rfqCaseId: caseId,
          vendorAccount: vendor.accountNumber,
          vendorName: vendor.name,
          email: vendor.email!,
          subject: `Request for quotation ${caseId} – ${cases[cases.length - 1].name}`,
          sentAt: iso(addDays(sent, 0)),
          sentBy: cases[cases.length - 1].requester,
          channel: "simulated",
          status: "sent",
        })
      }

      return {
        recordId: rfqId,
        rfqId,
        rfqCaseId: caseId,
        vendorAccount: vendor.accountNumber,
        vendorName: vendor.name,
        status: replyStatus,
        currency: "USD",
        sentDate: status === "Created" ? undefined : iso(sent),
        replyDate: replyDate ? iso(replyDate) : undefined,
        validUntil: replyDate ? iso(addDays(replyDate, int(30, 75))) : undefined,
        deliveryDate: replyDate ? iso(addDays(replyDate, maxLead)) : undefined,
        paymentTerms: hasReply ? vendor.paymentTerms : undefined,
        deliveryTerms: hasReply ? vendor.deliveryTerms : undefined,
        notes: hasReply && rand() < 0.35 ? pick(["Price valid for full quantity only.", "Volume discount available above 2x quantity.", "Partial shipments possible.", "Includes tooling cost amortisation.", "Freight included to destination."]) : undefined,
        totalAmount,
        lines: hasReply ? replyLines : [],
      }
    })

    if (status === "Accepted" || status === "Rejected") {
      const answered = caseReplies.filter((r) => r.status === "Received")
      if (answered.length === 0 && caseReplies.length > 0) {
        const r = caseReplies[0]
        r.status = "Received"
        r.replyDate = iso(addDays(created, 3))
      }
      const ranked = caseReplies
        .filter((r) => r.status === "Received")
        .sort((a, b) => (a.totalAmount ?? Infinity) - (b.totalAmount ?? Infinity))
      ranked.forEach((r, idx) => (r.status = status === "Accepted" && idx === 0 ? "Accepted" : "Rejected"))
    }
    if (status === "Received" && !caseReplies.some((r) => r.status === "Received")) {
      cases[cases.length - 1].status = "Sent"
    }

    replies.push(...caseReplies)
  }

  return {
    vendors: VENDORS.map((v) => ({
      accountNumber: v.accountNumber,
      name: v.name,
      email: v.email,
      vendorGroup: v.vendorGroup,
      rating: v.rating,
      onTimeDeliveryPct: v.onTimeDeliveryPct,
      city: v.city,
      country: v.country,
    })),
    cases,
    caseLines,
    replies,
    invitations,
  }
}
