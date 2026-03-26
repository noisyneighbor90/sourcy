import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { Agent, createSigner, createUser, validHex } from "@xmtp/agent-sdk";
import { fromString } from "uint8arrays";
import { scoreOffer } from "./scoring.js";
import type {
  ProcurementOffer,
  ProcurementCriteria,
  OfferScore,
} from "./types.js";

// --- x402 imports ---
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

// --- World AgentKit imports ---
import {
  declareAgentkitExtension,
  agentkitResourceServerExtension,
  createAgentkitHooks,
  createAgentBookVerifier,
  InMemoryAgentKitStorage,
} from "@worldcoin/agentkit";

process.loadEnvFile(".env");

const walletKey = process.env.BUYER_WALLET_KEY!;
const dbEncryptionKeyHex = process.env.BUYER_DB_ENCRYPTION_KEY!;
const env = (process.env.XMTP_ENV || "dev") as "dev" | "production";
const port = parseInt(process.env.BUYER_PORT || "4001");

// The buyer's wallet address — receives x402 payments
const buyerWalletAddress = process.env.BUYER_WALLET_ADDRESS || "0xea7b03173ba82f8e294ce951adc9ea021abc09c6";

// Base Sepolia for testing (Base mainnet eip155:8453 for production)
const NETWORK = "eip155:84532";

// Procurement criteria
const criteria: ProcurementCriteria = {
  item: "industrial sensors",
  maxUnitPrice: 150,
  maxLeadTimeDays: 30,
  requiredCertifications: ["ISO 9001", "CE"],
  targetQuantity: 500,
};

// Store scored offers for dashboard
export const scoredOffers: Array<
  OfferScore & { supplierName: string; supplierAddress: string; receivedAt: string }
> = [];

// ============================================================
// 1. HONO SERVER WITH x402 + WORLD AGENTKIT
// ============================================================

const app = new Hono();
app.use("/*", cors());

// --- World AgentKit setup ---
const agentBook = createAgentBookVerifier();
const storage = new InMemoryAgentKitStorage();
const hooks = createAgentkitHooks({
  storage,
  agentBook,
  mode: { type: "free-trial", uses: 3 },
});

// --- x402 setup ---
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

const evmScheme = new ExactEvmScheme();

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, evmScheme)
  .registerExtension(agentkitResourceServerExtension);

// x402 payment middleware — protects the offer submission endpoint
app.use(
  paymentMiddleware(
    {
      "POST /api/offers": {
        accepts: {
          scheme: "exact",
          price: "$0.01",
          network: NETWORK,
          payTo: buyerWalletAddress,
        },
        description: "Submit a procurement offer to the buyer agent",
        extensions: declareAgentkitExtension({
          statement: "Verify your agent is backed by a real human via World ID",
          mode: { type: "free-trial", uses: 3 },
        }),
      },
    },
    resourceServer,
  ),
);

// --- Health endpoint ---
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    agent: "sourcy-buyer",
    xmtpAddress: agent.address,
    criteria,
    offersReceived: scoredOffers.length,
  });
});

// --- Protected offer submission endpoint ---
app.post("/api/offers", async (c) => {
  const body = await c.req.json<ProcurementOffer>();

  if (body.type !== "procurement_offer") {
    return c.json({ error: 'Expected type "procurement_offer"' }, 400);
  }

  const result = scoreOffer(body, criteria);

  const entry = {
    ...result,
    supplierName: body.supplierName,
    supplierAddress: c.req.header("x-supplier-address") || "unknown",
    receivedAt: new Date().toISOString(),
  };
  scoredOffers.push(entry);

  console.log(
    `[HTTP] Offer ${result.offerId} from ${body.supplierName}: ${result.score}/100 (${result.status})`,
  );

  return c.json(result);
});

// --- Direct offer submission (post-payment, for demo) ---
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
    receivedAt: new Date().toISOString(),
  });

  console.log(
    `[HTTP/Direct] Offer ${result.offerId} from ${body.supplierName}: ${result.score}/100 (${result.status})`,
  );

  return c.json(result);
});

// --- Reset endpoint (demo only) ---
app.delete("/api/offers/reset", (c) => {
  scoredOffers.length = 0;
  console.log("[HTTP] Dashboard reset — all offers cleared");
  return c.json({ status: "ok", cleared: true });
});

// --- Dashboard data endpoint ---
app.get("/api/offers", (c) => {
  return c.json({
    criteria,
    offers: scoredOffers,
    total: scoredOffers.length,
  });
});

// --- Serve frontend ---
app.get("/*", serveStatic({ root: "./public" }));

// ============================================================
// 2. XMTP AGENT (runs alongside the HTTP server)
// ============================================================

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
    `[XMTP] Offer ${offer.offerId} from ${offer.supplierName} (${senderAddress}): ${offer.quantity}x ${offer.item} @ $${offer.unitPrice}`,
  );

  const result = scoreOffer(offer, criteria);

  scoredOffers.push({
    ...result,
    supplierName: offer.supplierName,
    supplierAddress: senderAddress,
    receivedAt: new Date().toISOString(),
  });

  console.log(
    `[XMTP] Scored: ${result.score}/100 — ${result.status}`,
  );

  await ctx.conversation.sendText(JSON.stringify(result));
});

agent.on("start", () => {
  console.log("=== SOURCY BUYER AGENT ===");
  console.log(`XMTP Address: ${agent.address}`);
  console.log(`HTTP Server: http://localhost:${port}`);
  console.log(`Environment: ${env}`);
  console.log(`Looking for: ${criteria.item}`);
  console.log(`Max price: $${criteria.maxUnitPrice} | Max lead time: ${criteria.maxLeadTimeDays}d`);
  console.log(`Required certs: ${criteria.requiredCertifications.join(", ")}`);
  console.log(`x402 payment: $0.01 USDC on Base Sepolia`);
  console.log("Waiting for offers via XMTP and HTTP...\n");
});

// Start both XMTP agent and HTTP server
serve({ fetch: app.fetch, port }, () => {
  console.log(`HTTP server listening on port ${port}`);
});

await agent.start();
