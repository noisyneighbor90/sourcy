import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { scoreOffer } from "./scoring.js";
import type {
  ProcurementOffer,
  ProcurementCriteria,
  OfferScore,
} from "./types.js";

const port = parseInt(process.env.PORT || process.env.BUYER_PORT || "4001");

// Buyer profiles
const profiles = [
  {
    name: "Nexon Electronics",
    criteria: {
      item: "PCB assembly",
      maxUnitPrice: 15,
      maxLeadTimeDays: 45,
      requiredCertifications: ["ISO 9001", "IPC-A-610"],
      targetQuantity: 500,
    } as ProcurementCriteria,
  },
  {
    name: "Baltic Robotics UAB",
    criteria: {
      item: "servo motors",
      maxUnitPrice: 280,
      maxLeadTimeDays: 30,
      requiredCertifications: ["ISO 9001", "CE"],
      targetQuantity: 500,
    } as ProcurementCriteria,
  },
  {
    name: "Nordic HVAC Group",
    criteria: {
      item: "plastic housings",
      maxUnitPrice: 12,
      maxLeadTimeDays: 60,
      requiredCertifications: ["ISO 9001", "CE", "RoHS"],
      targetQuantity: 500,
    } as ProcurementCriteria,
  },
];

let activeProfileIndex = 0;
let criteria: ProcurementCriteria = profiles[0].criteria;

const scoredOffers: Array<
  OfferScore & { supplierName: string; supplierAddress: string; channel: string; receivedAt: string }
> = [];

const app = new Hono();
app.use("/*", cors());

// --- Health ---
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    agent: "sourcy-buyer",
    xmtpAddress: null,
    profileName: profiles[activeProfileIndex].name,
    criteria,
    offersReceived: scoredOffers.length,
  });
});

// --- Profiles ---
app.get("/api/profiles", (c) => {
  return c.json({
    profiles: profiles.map((p, i) => ({ index: i, name: p.name, criteria: p.criteria })),
    active: activeProfileIndex,
  });
});

app.post("/api/profiles/select", async (c) => {
  const { profileIndex } = await c.req.json<{ profileIndex: number }>();
  if (profileIndex < 0 || profileIndex >= profiles.length) {
    return c.json({ error: "Invalid profile index" }, 400);
  }
  activeProfileIndex = profileIndex;
  criteria = profiles[profileIndex].criteria;
  scoredOffers.length = 0;
  return c.json({ status: "ok", name: profiles[profileIndex].name, criteria });
});

// --- Offers (x402 gate simulated — returns 402 then allows /direct) ---
app.post("/api/offers", async (c) => {
  return c.json({}, 402);
});

app.post("/api/offers/direct", async (c) => {
  const body = await c.req.json<ProcurementOffer>();
  if (body.type !== "procurement_offer") {
    return c.json({ error: 'Expected type "procurement_offer"' }, 400);
  }
  const result = scoreOffer(body, criteria);
  scoredOffers.push({
    ...result,
    supplierName: body.supplierName,
    supplierAddress: c.req.header("x-supplier-address") || "demo-ui",
    channel: "http",
    receivedAt: new Date().toISOString(),
  });
  return c.json(result);
});

// --- Reset ---
app.delete("/api/offers/reset", (c) => {
  scoredOffers.length = 0;
  return c.json({ status: "ok", cleared: true });
});

// --- Demo data ---
app.post("/api/offers/demo", (c) => {
  scoredOffers.length = 0;
  const now = Date.now();
  scoredOffers.push(
    {
      type: "offer_score",
      offerId: "d7a1e3",
      score: 96,
      status: "qualified",
      breakdown: { priceScore: 90, leadTimeScore: 100, certificationScore: 100 },
      feedback: "Offer meets procurement criteria. Score: 96/100.",
      supplierName: "TLT Electronics UAB",
      supplierAddress: "0x256c736a07ca76e079e372b24b802a07ddec8704",
      channel: "xmtp",
      receivedAt: new Date(now - 45000).toISOString(),
    },
    {
      type: "offer_score",
      offerId: "b4f829",
      score: 74,
      status: "under_review",
      breakdown: { priceScore: 77, leadTimeScore: 93, certificationScore: 50 },
      feedback: "Offer is borderline. Score: 74/100. Areas to improve: certifications.",
      supplierName: "PCBuild Poland",
      supplierAddress: "0x3a9f1d82e6b04c5a7f8e2d19b6c34a5e7f801234",
      channel: "xmtp",
      receivedAt: new Date(now - 30000).toISOString(),
    },
    {
      type: "offer_score",
      offerId: "9c3f17",
      score: 31,
      status: "rejected",
      breakdown: { priceScore: 47, leadTimeScore: 67, certificationScore: 0 },
      feedback: "Offer does not meet minimum requirements. Score: 31/100.",
      supplierName: "ShenTech Manufacturing",
      supplierAddress: "0x7b2c4e8f1a3d5690b2e7c4f8a1d3e5b7c9023456",
      channel: "xmtp",
      receivedAt: new Date(now - 15000).toISOString(),
    },
  );
  return c.json({ status: "ok", loaded: 3 });
});

// --- Dashboard data ---
app.get("/api/offers", (c) => {
  return c.json({
    criteria,
    offers: scoredOffers,
    total: scoredOffers.length,
    qualified: scoredOffers.filter((o) => o.status === "qualified").length,
    rejected: scoredOffers.filter((o) => o.status === "rejected").length,
    under_review: scoredOffers.filter((o) => o.status === "under_review").length,
  });
});

// --- Static files ---
app.get("/demo", serveStatic({ path: "./public/demo.html" }));
app.get("/*", serveStatic({ root: "./public" }));

// --- Start ---
serve({ fetch: app.fetch, port }, () => {
  console.log(`Sourcy web server listening on port ${port}`);
  console.log(`Profile: ${profiles[activeProfileIndex].name}`);
  console.log(`Looking for: ${criteria.item}`);
});
