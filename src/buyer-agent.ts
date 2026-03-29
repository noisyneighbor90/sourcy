import { Agent, createSigner, createUser, validHex } from "@xmtp/agent-sdk";
import { fromString } from "uint8arrays";
import { scoreOffer } from "./scoring.js";
import type { ProcurementOffer, ProcurementCriteria, OfferScore } from "./types.js";

try { process.loadEnvFile(".env"); } catch {}

const walletKey = process.env.BUYER_WALLET_KEY;
const dbEncryptionKeyHex = process.env.BUYER_DB_ENCRYPTION_KEY;
const env = (process.env.XMTP_ENV || "dev") as "dev" | "production";

if (!walletKey || !dbEncryptionKeyHex) {
  console.error("Missing BUYER_WALLET_KEY or BUYER_DB_ENCRYPTION_KEY in .env");
  process.exit(1);
}

// Active procurement criteria — what the buyer is looking for
const criteria: ProcurementCriteria = {
  item: "industrial sensors",
  maxUnitPrice: 150,
  maxLeadTimeDays: 30,
  requiredCertifications: ["ISO 9001", "CE"],
  targetQuantity: 500,
};

// Store scored offers for the dashboard
const scoredOffers: Array<OfferScore & { supplierName: string; receivedAt: Date }> = [];

// Create agent
const user = createUser(validHex(walletKey));
const signer = createSigner(user);
const encryptionKey = fromString(dbEncryptionKeyHex.replace("0x", ""), "hex");

const agent = await Agent.create(signer, {
  env,
  dbEncryptionKey: encryptionKey,
  dbPath: (inboxId) => `./${env}-buyer-${inboxId.slice(0, 8)}.db3`,
});

agent.on("text", async (ctx) => {
  if (!ctx.isDm()) return;

  const senderAddress = await ctx.getSenderAddress();
  const raw = ctx.message.content as string;

  console.log(`\n--- Incoming message from ${senderAddress} ---`);

  // Try to parse as a procurement offer
  let offer: ProcurementOffer;
  try {
    offer = JSON.parse(raw);
    if (offer.type !== "procurement_offer") {
      await ctx.conversation.sendText(
        JSON.stringify({
          type: "error",
          message: 'Expected message type "procurement_offer".',
        }),
      );
      return;
    }
  } catch {
    await ctx.conversation.sendText(
      JSON.stringify({
        type: "error",
        message:
          "Could not parse message. Send a JSON object with type: procurement_offer.",
      }),
    );
    return;
  }

  console.log(
    `Offer ${offer.offerId} from ${offer.supplierName}: ${offer.quantity}x ${offer.item} @ $${offer.unitPrice}`,
  );

  // Score it
  const result = scoreOffer(offer, criteria);

  // Store for dashboard
  scoredOffers.push({
    ...result,
    supplierName: offer.supplierName,
    receivedAt: new Date(),
  });

  console.log(
    `Scored: ${result.score}/100 — ${result.status}`,
  );
  console.log(`  Price: ${result.breakdown.priceScore} | Lead: ${result.breakdown.leadTimeScore} | Certs: ${result.breakdown.certificationScore}`);

  // Reply with score
  await ctx.conversation.sendText(JSON.stringify(result));
  console.log("Reply sent.\n");
});

agent.on("start", () => {
  console.log("=== SOURCY BUYER AGENT ===");
  console.log(`Address: ${agent.address}`);
  console.log(`Environment: ${env}`);
  console.log(`Looking for: ${criteria.item}`);
  console.log(`Max price: $${criteria.maxUnitPrice} | Max lead time: ${criteria.maxLeadTimeDays}d`);
  console.log(`Required certs: ${criteria.requiredCertifications.join(", ")}`);
  console.log("Waiting for offers...\n");
});

await agent.start();
