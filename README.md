# sourcy

**Verified agent-to-agent procurement network.**

AI procurement agents represent real verified humans on both sides of a B2B transaction. Supplier agents must prove human backing via World ID and pay per request via x402 micropayments before their offers reach a buyer. Agents communicate peer-to-peer over XMTP. Spam is economically impossible. Every agent in the network is a real person.

Built for the **World x Coinbase x XMTP AgentKit Hackathon 2026**.

---

## How it works

| Step | What happens |
|------|-------------|
| **1. Buyer publishes criteria** | A procurement manager sets item specs, price limits, and required certifications. The buyer agent listens for offers. |
| **2. Supplier agents compete** | Supplier agents send structured JSON offers via XMTP. Each submission is gated by an x402 micropayment (0.01 USDC) and World ID verification. |
| **3. Only verified matches surface** | The buyer agent scores each offer against criteria (price, lead time, certifications), rejects unqualified submissions, and surfaces ranked results on a live dashboard. |

---

## Technologies

| Technology | Role | How it's used |
|-----------|------|--------------|
| **World ID AgentKit** | Trust layer | Every agent registers its wallet via AgentKit CLI, linking it to a World ID verified human. The buyer server verifies human backing on every request via AgentBook lookup. Unverified bots are rejected. |
| **Coinbase x402** | Payment & spam filter | The buyer's offer endpoint (`POST /api/offers`) is protected by x402 middleware. Supplier agents receive HTTP 402, pay 0.01 USDC on-chain, and the payment is verified before access is granted. |
| **XMTP** | Communication layer | Agents communicate over XMTP using `@xmtp/agent-sdk`. Supplier creates a DM with the buyer's Ethereum address, sends a structured procurement offer, and receives a score reply. Real peer-to-peer transport. |

---

## Run the demo

```bash
# Clone and install
git clone https://github.com/noisyneighbor90/sourcy.git
cd sourcy
npm install

# Generate XMTP agent keys (only needed once)
npx tsx src/generate-keys.ts > .env

# Start the buyer agent + HTTP server
npm run buyer
# Note the XMTP address printed in the console

# In a second terminal, start the supplier agent
npm run supplier -- <buyer-xmtp-address>

# Open the dashboard
open http://localhost:4001
```

### Requirements

- Node.js >= 20
- npm

---

## Project structure

```
sourcy/
  public/
    index.html        Landing page
    demo.html         Two-panel live demo dashboard
  src/
    buyer-server.ts   Buyer agent: Hono + x402 + AgentKit + XMTP
    supplier-agent.ts Supplier agent: sends offers via XMTP + HTTP
    scoring.ts        Offer scoring engine
    types.ts          TypeScript interfaces
    generate-keys.ts  XMTP key generator
  Dockerfile          Docker deployment
  railway.json        Railway deployment config
```

---

## Tech stack

- **Runtime**: Node.js + TypeScript
- **Server**: Hono with @hono/node-server
- **Agent messaging**: @xmtp/agent-sdk
- **Payment gate**: @x402/hono, @x402/core, @x402/evm
- **Human verification**: @worldcoin/agentkit
- **Blockchain**: Base Sepolia (testnet)
- **Payment token**: USDC
