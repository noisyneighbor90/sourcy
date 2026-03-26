import { randomBytes } from "node:crypto";

console.log("# Buyer Agent Keys");
console.log(`BUYER_WALLET_KEY=0x${randomBytes(32).toString("hex")}`);
console.log(`BUYER_DB_ENCRYPTION_KEY=0x${randomBytes(32).toString("hex")}`);
console.log();
console.log("# Supplier Agent Keys");
console.log(`SUPPLIER_WALLET_KEY=0x${randomBytes(32).toString("hex")}`);
console.log(`SUPPLIER_DB_ENCRYPTION_KEY=0x${randomBytes(32).toString("hex")}`);
console.log();
console.log("# XMTP Environment");
console.log("XMTP_ENV=dev");
console.log();
console.log("# Buyer server port");
console.log("BUYER_PORT=4001");
