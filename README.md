# Sourcy

Verified agent-to-agent procurement network. AI procurement agents represent real humans on both sides of a B2B transaction. Spam is economically impossible — every agent must prove human backing via World ID and pay per request via x402.

Built for the World x Coinbase x XMTP AgentKit Hackathon.

## What is Sourcy

A supplier agent wants to reach a buyer agent with a procurement offer. The buyer agent's endpoint is protected — you must prove you are human-backed (World ID) and pay to submit (x402 micropayment). Agents communicate over XMTP, a decentralized messaging protocol. The buyer agent scores incoming offers against procurement criteria and surfaces only qualified offers to a human procurement manager on a live dashboard.

The demo shows two agents running simultaneously. The supplier submits offers, pays the x402 gate, passes World ID verification, and receives a score. The buyer dashboard updates in real time — qualified offers in green, rejected offers in red.

## How to run it

```bash
# Install dependencies
cd ~/Desktop/projects/sourcy
npm install

# Generate XMTP keys (only needed once)
npm run generate-keys > .env

# Start the buyer agent + HTTP server
npm run buyer

# In a second terminal, start the supplier agent
# (use the buyer's XMTP address printed in the first terminal)
npm run supplier -- <buyer-xmtp-address>

# Open the dashboard
open http://localhost:4001
```

### Requirements

- Node.js >= 20
- npm

## How each technology is used

### World ID AgentKit — Trust Layer

Every agent registers its wallet via the AgentKit CLI, linking it to a World ID verified human. The buyer server uses `@worldcoin/agentkit` to verify human backing on every incoming request via AgentBook lookup. Unverified agents are rejected. This ensures every agent in the network represents a real person, not a bot.

**Packages:** `@worldcoin/agentkit` — `createAgentBookVerifier()`, `createAgentkitHooks()`, `declareAgentkitExtension()`

### Coinbase x402 — Payment and Spam Filter Layer

The buyer agent's offer submission endpoint (`POST /api/offers`) is protected by x402 payment middleware. When a supplier agent hits this endpoint, it receives an HTTP 402 response with payment instructions. The supplier pays 0.01 USDC on-chain, and the payment is verified by the x402 facilitator before access is granted. Per-request micropayment. No subscription needed. Spam is economically impossible.

**Packages:** `@x402/hono`, `@x402/core`, `@x402/evm` — `paymentMiddleware()`, `x402ResourceServer`, `HTTPFacilitatorClient`

### XMTP — Communication Layer

Agents talk to each other over XMTP, a decentralized messaging protocol. The supplier agent creates a DM with the buyer agent using its Ethereum address and sends a structured JSON procurement offer. The buyer agent receives the message, scores it against procurement criteria (price, lead time, certifications), and replies with the score. This is real peer-to-peer agent communication, not a mocked chat UI.

**Packages:** `@xmtp/agent-sdk` — `Agent.create()`, `agent.createDmWithAddress()`, `agent.on("text")`
