import { createHmac } from "node:crypto";

export function sessionUserId(secret: string, gate: string, wallet: string): string {
  const message = gate.toLowerCase() + wallet.toLowerCase();
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return `cg-${digest}`;
}
