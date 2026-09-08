const KEY = "gatewayNames";

const read = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};

export const gatewayName = (address: string) =>
  read()[address.toLowerCase()] ?? `Gateway ${address.slice(0, 6)}…${address.slice(-4)}`;
