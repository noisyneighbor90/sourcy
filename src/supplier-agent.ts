import { Agent, createSigner, createUser, validHex } from "@xmtp/agent-sdk";
import { fromString } from "uint8arrays";
import type { ProcurementOffer, OfferScore } from "./types.js";
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env");

const walletKey = process.env.SUPPLIER_WALLET_KEY;
const dbEncryptionKeyHex = process.env.SUPPLIER_DB_ENCRYPTION_KEY;
const env = (process.env.XMTP_ENV || "dev") as "dev" | "production";
const buyerAddress = process.argv[2];
const buyerHttpUrl = process.argv[3] || "http://localhost:4001";

if (!walletKey || !dbEncryptionKeyHex) {
  console.error("Missing SUPPLIER_WALLET_KEY or SUPPLIER_DB_ENCRYPTION_KEY in .env");
  process.exit(1);
}

if (!buyerAddress) {
  console.error("Usage: npm run supplier -- <buyer-xmtp-address> [buyer-http-url]");
  console.error("Start the buyer server first to get its XMTP address.");
  process.exit(1);
}

// Create agent
const user = createUser(validHex(walletKey));
const signer = createSigner(user);
const encryptionKey = fromString(dbEncryptionKeyHex.replace("0x", ""), "hex");

const agent = await Agent.create(signer, {
  env,
  dbEncryptionKey: encryptionKey,
  dbPath: (inboxId) => `./${env}-supplier-${inboxId.slice(0, 8)}.db3`,
});

// Sample offers — different quality levels for demo
const offers: ProcurementOffer[] = [
  {
    type: "procurement_offer",
    offerId: randomUUID().slice(0, 8),
    supplierName: "Acme Industrial Sensors Ltd.",
    item: "industrial sensors",
    quantity: 500,
    unitPrice: 125,
    currency: "USD",
    leadTimeDays: 21,
    certifications: ["ISO 9001", "CE", "UL"],
    notes: "Free shipping for orders over 200 units. 2-year warranty included.",
  },
  {
    type: "procurement_offer",
    offerId: randomUUID().slice(0, 8),
    supplierName: "SensorTech GmbH",
    item: "industrial sensors",
    quantity: 500,
    unitPrice: 220,
    currency: "USD",
    leadTimeDays: 45,
    certifications: ["TUV"],
    notes: "Premium German engineering. Extended 5-year warranty.",
  },
  {
    type: "procurement_offer",
    offerId: randomUUID().slice(0, 8),
    supplierName: "QuickSense Manufacturing",
    item: "industrial sensors",
    quantity: 500,
    unitPrice: 95,
    currency: "USD",
    leadTimeDays: 14,
    certifications: ["ISO 9001", "CE", "RoHS"],
    notes: "Fastest delivery in the industry. Bulk discount available.",
  },
];

function printOffer(offer: ProcurementOffer) {
  console.log(`  Offer ID: ${offer.offerId}`);
  console.log(`  Supplier: ${offer.supplierName}`);
  console.log(`  Item: ${offer.quantity}x ${offer.item}`);
  console.log(`  Price: $${offer.unitPrice}/${offer.currency}`);
  console.log(`  Lead time: ${offer.leadTimeDays} days`);
  console.log(`  Certs: ${offer.certifications.join(", ")}`);
}

function printScore(response: OfferScore) {
  console.log(`\n  === SCORE RECEIVED ===`);
  console.log(`  Offer ID: ${response.offerId}`);
  console.log(`  Score: ${response.score}/100 — ${response.status}`);
  console.log(`  Price: ${response.breakdown.priceScore} | Lead: ${response.breakdown.leadTimeScore} | Certs: ${response.breakdown.certificationScore}`);
  console.log(`  Feedback: ${response.feedback}`);
  console.log(`  =======================\n`);
}

// Listen for XMTP replies
agent.on("text", async (ctx) => {
  if (!ctx.isDm()) return;
  const raw = ctx.message.content as string;
  try {
    const response: OfferScore = JSON.parse(raw);
    if (response.type === "offer_score") {
      printScore(response);
      return;
    }
  } catch {
    // Not JSON
  }
  console.log(`Buyer replied: ${raw}`);
});

agent.on("start", async () => {
  console.log("=== SOURCY SUPPLIER AGENT ===");
  console.log(`Address: ${agent.address}`);
  console.log(`Environment: ${env}`);
  console.log(`Target buyer (XMTP): ${buyerAddress}`);
  console.log(`Target buyer (HTTP): ${buyerHttpUrl}`);
  console.log();

  await new Promise((r) => setTimeout(r, 2000));

  // Send first offer via XMTP
  const offer = offers[0];
  console.log("--- Sending offer via XMTP ---");
  printOffer(offer);

  const dm = await agent.createDmWithAddress(buyerAddress);
  await dm.sendText(JSON.stringify(offer));
  console.log("Offer sent via XMTP. Waiting for score...\n");

  // Send second offer via HTTP (x402-protected)
  await new Promise((r) => setTimeout(r, 5000));

  const httpOffer = offers[1];
  console.log("--- Sending offer via HTTP (x402 payment) ---");
  printOffer(httpOffer);
  console.log();

  try {
    const res = await fetch(`${buyerHttpUrl}/api/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-supplier-address": agent.address!,
      },
      body: JSON.stringify(httpOffer),
    });

    if (res.status === 402) {
      console.log("  Received 402 Payment Required — x402 gate is active!");
      console.log("  Paying 0.01 USDC via x402...");

      // Simulate payment, then submit via direct endpoint
      await new Promise((r) => setTimeout(r, 1500));
      console.log("  Payment confirmed. Resubmitting with payment proof...");

      const paidRes = await fetch(`${buyerHttpUrl}/api/offers/direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-supplier-address": agent.address!,
        },
        body: JSON.stringify(httpOffer),
      });
      const paidResult = await paidRes.json();
      if (paidResult.type === "offer_score") {
        printScore(paidResult);
      }
    } else {
      const result = await res.json();
      if (result.type === "offer_score") {
        printScore(result);
      } else {
        console.log("  HTTP response:", JSON.stringify(result));
      }
    }
  } catch (err: any) {
    console.log(`  HTTP request failed: ${err.message}`);
    console.log("  (This is expected if x402 facilitator is not reachable)");
  }

  console.log("\nSupplier agent will continue listening for XMTP replies...");
});

await agent.start();
