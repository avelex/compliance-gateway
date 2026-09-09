import { PrivyClient } from "@privy-io/node";

const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET
});

async function run() {
  let org;
  for await (const o of privy.organizations().list()) {
    org = o;
    break;
  }
  const walletId = "dp0zdcrw77d1lsp9sgbyvf3u";
  try {
    await privy.wallets().assignEntity(walletId, { type: "organization", id: org.id });
    console.log("assigned");
  } catch (e) {
    console.error("assign failed", e.message);
  }
}
run();
