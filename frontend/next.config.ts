import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  webpack(config) {
    // @privy-io/react-auth imports this only for Farcaster mini-apps, which we do not use. It is
    // an optional dependency it does not declare, so webpack reports it as unresolvable; false
    // tells webpack to leave the import empty rather than adding a package we never call.
    config.resolve.alias["@farcaster/mini-app-solana"] = false;
    return config;
  },
};
export default config;
