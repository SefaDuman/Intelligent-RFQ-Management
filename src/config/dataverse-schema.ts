/**
 * Mapping between the app's domain model and the Dynamics 365 Finance & Supply
 * Chain data entities exposed in Dataverse as virtual tables (mserp_*).
 *
 * Naming convention for F&SC virtual tables:
 *   table   -> mserp_<entityname lowercased>        e.g. mserp_vendvendorv2entity
 *   column  -> mserp_<entity field name lowercased> e.g. mserp_vendoraccountnumber
 *   key     -> mserp_<entityname lowercased>id
 *
 * Entity and field names can differ between F&SC versions and customizations.
 * Verified against Frontier's generated VRM entity metadata on 2026-10-09.
 * Verify each name in make.powerapps.com > Tables (filter on "mserp_vrmrequest")
 * and adjust the values below. Set a column to `null` if it doesn't exist in
 * your environment; the app degrades gracefully for optional fields.
 */

export type ColumnMap<K extends string> = Record<K, string | null>

export interface TableMapping<K extends string> {
  /** Dataverse logical name of the virtual table. */
  logicalName: string
  columns: ColumnMap<K>
}

export const rfqCaseTable: TableMapping<
  | "recordId"
  | "rfqCaseId"
  | "name"
  | "status"
  | "company"
  | "currency"
  | "procurementCategory"
  | "requester"
  | "createdDate"
  | "expiryDate"
  | "requestedDeliveryDate"
  | "deliveryTerms"
> = {
  logicalName: "mserp_vrmrequestforquotationheaderentity",
  columns: {
    recordId: "mserp_vrmrequestforquotationheaderentityid",
    rfqCaseId: "mserp_rfqcasenumber",
    name: "mserp_rfqcasetitle",
    // F&SC tracks lowest/highest status across vendors; highest reflects progress.
    status: "mserp_highestrfqstatus",
    company: "mserp_dataareaid",
    currency: "mserp_currencycode",
    procurementCategory: null,
    requester: "mserp_requestername",
    createdDate: null,
    expiryDate: "mserp_rfqexpirationdatetime",
    requestedDeliveryDate: "mserp_requesteddeliverydate",
    deliveryTerms: "mserp_deliverytermscode",
  },
}

export const rfqCaseLineTable: TableMapping<
  | "recordId"
  | "rfqCaseId"
  | "lineNumber"
  | "itemNumber"
  | "itemName"
  | "quantity"
  | "unit"
  | "procurementCategory"
  | "requestedDeliveryDate"
  | "targetUnitPrice"
  | "priceQuantity"
  | "company"
> = {
  logicalName: "mserp_vrmrequestforquotationlineentity",
  columns: {
    recordId: "mserp_vrmrequestforquotationlineentityid",
    rfqCaseId: "mserp_rfqcasenumber",
    lineNumber: "mserp_rfqcaselinelinenumber",
    itemNumber: "mserp_itemnumber",
    itemName: "mserp_requestedlinedescription",
    quantity: "mserp_requestedpurchasequantity",
    unit: "mserp_requestedquantityunitsymbol",
    procurementCategory: "mserp_procurementproductcategoryname",
    requestedDeliveryDate: "mserp_requesteddeliverydate",
    targetUnitPrice: "mserp_requestedpurchaseprice",
    priceQuantity: "mserp_requestedpurchasepricequantity",
    company: "mserp_dataareaid",
  },
}

export const rfqReplyTable: TableMapping<
  | "recordId"
  | "rfqId"
  | "rfqCaseId"
  | "vendorAccount"
  | "vendorName"
  | "status"
  | "currency"
  | "sentDate"
  | "replyDate"
  | "validUntil"
  | "deliveryDate"
  | "paymentTerms"
  | "deliveryTerms"
  | "notes"
  | "company"
> = {
  logicalName: "mserp_vrmrequestforquotationreplyheaderentity",
  columns: {
    recordId: "mserp_vrmrequestforquotationreplyheaderentityid",
    rfqId: "mserp_rfqnumber",
    rfqCaseId: "mserp_rfqcasenumber",
    vendorAccount: "mserp_vendoraccountnumber",
    vendorName: null,
    status: "mserp_highestrfqstatus",
    currency: "mserp_replycurrencycode",
    sentDate: null,
    replyDate: "mserp_vendorreplysubmissiondatetime",
    validUntil: "mserp_replyvaliditydateend",
    deliveryDate: "mserp_replydeliverydate",
    paymentTerms: "mserp_replypaymenttermsname",
    deliveryTerms: "mserp_replydeliverytermscode",
    notes: null,
    company: "mserp_dataareaid",
  },
}

export const rfqReplyLineTable: TableMapping<
  | "recordId"
  | "rfqId"
  | "lineNumber"
  | "itemNumber"
  | "quantity"
  | "unitPrice"
  | "discountPct"
  | "netAmount"
  | "leadTimeDays"
  | "deliveryDate"
  | "priceQuantity"
  | "company"
  | "alternate"
> = {
  logicalName: "mserp_vrmrequestforquotationreplylineentity",
  columns: {
    recordId: "mserp_vrmrequestforquotationreplylineentityid",
    rfqId: "mserp_rfqnumber",
    lineNumber: "mserp_rfqcaselinelinenumber",
    itemNumber: "mserp_itemnumber",
    quantity: "mserp_replypurchasequantity",
    unitPrice: "mserp_replypurchaseprice",
    discountPct: "mserp_replylinediscountpercentage",
    netAmount: "mserp_lineamount",
    leadTimeDays: "mserp_procurementleadtimedays",
    deliveryDate: "mserp_replydeliverydate",
    priceQuantity: "mserp_replypurchasepricequantity",
    company: "mserp_dataareaid",
    alternate: "mserp_isalternateproduct",
  },
}

export const vendorTable: TableMapping<
  "recordId" | "accountNumber" | "name" | "email" | "vendorGroup" | "city" | "country" | "company"
> = {
  logicalName: "mserp_vendvendorv2entity",
  columns: {
    recordId: "mserp_vendvendorv2entityid",
    accountNumber: "mserp_vendoraccountnumber",
    name: "mserp_vendororganizationname",
    email: "mserp_primaryemailaddress",
    vendorGroup: "mserp_vendorgroupid",
    city: "mserp_addresscity",
    country: "mserp_addresscountryregionid",
    company: "mserp_dataareaid",
  },
}

export const dataverseTables = {
  rfqCase: rfqCaseTable,
  rfqCaseLine: rfqCaseLineTable,
  rfqReply: rfqReplyTable,
  rfqReplyLine: rfqReplyLineTable,
  vendor: vendorTable,
} as const

export type DataverseTableKey = keyof typeof dataverseTables
