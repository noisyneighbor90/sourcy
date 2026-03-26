// Structured procurement offer sent from supplier to buyer
export interface ProcurementOffer {
  type: "procurement_offer";
  offerId: string;
  supplierName: string;
  item: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  leadTimeDays: number;
  certifications: string[];
  notes: string;
}

// Score response sent from buyer back to supplier
export interface OfferScore {
  type: "offer_score";
  offerId: string;
  score: number; // 0-100
  status: "qualified" | "rejected" | "under_review";
  breakdown: {
    priceScore: number;
    leadTimeScore: number;
    certificationScore: number;
  };
  feedback: string;
}

// Buyer's procurement criteria
export interface ProcurementCriteria {
  item: string;
  maxUnitPrice: number;
  maxLeadTimeDays: number;
  requiredCertifications: string[];
  targetQuantity: number;
}
