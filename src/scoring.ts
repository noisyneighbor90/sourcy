import type { ProcurementOffer, OfferScore, ProcurementCriteria } from "./types.js";

export function scoreOffer(
  offer: ProcurementOffer,
  criteria: ProcurementCriteria,
): OfferScore {
  // Price score: 100 if at or below target, scales down linearly to 0 at 2x target
  const priceRatio = offer.unitPrice / criteria.maxUnitPrice;
  const priceScore = Math.min(100, Math.max(0, Math.round((1 - (priceRatio - 1)) * 100)));

  // Lead time score: 100 if at or below target, scales down linearly to 0 at 2x target
  const leadRatio = offer.leadTimeDays / criteria.maxLeadTimeDays;
  const leadTimeScore = Math.min(100, Math.max(0, Math.round((1 - (leadRatio - 1)) * 100)));

  // Certification score: percentage of required certs that are present
  const matchedCerts = criteria.requiredCertifications.filter((c) =>
    offer.certifications.map((x) => x.toLowerCase()).includes(c.toLowerCase()),
  );
  const certificationScore =
    criteria.requiredCertifications.length > 0
      ? Math.round(
          (matchedCerts.length / criteria.requiredCertifications.length) * 100,
        )
      : 100;

  // Weighted total
  const score = Math.round(
    priceScore * 0.4 + leadTimeScore * 0.3 + certificationScore * 0.3,
  );

  const status: OfferScore["status"] =
    score >= 70 ? "qualified" : score >= 40 ? "under_review" : "rejected";

  const feedback =
    status === "qualified"
      ? `Offer meets procurement criteria. Score: ${score}/100.`
      : status === "under_review"
        ? `Offer is borderline. Score: ${score}/100. Areas to improve: ${priceScore < 70 ? "price" : ""}${leadTimeScore < 70 ? " lead time" : ""}${certificationScore < 70 ? " certifications" : ""}.`.trim()
        : `Offer does not meet minimum requirements. Score: ${score}/100.`;

  return {
    type: "offer_score",
    offerId: offer.offerId,
    score,
    status,
    breakdown: { priceScore, leadTimeScore, certificationScore },
    feedback,
  };
}
