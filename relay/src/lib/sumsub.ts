import { createHmac } from "node:crypto";

const BASE_URL = process.env.SUMSUB_BASE_URL ?? "https://api.sumsub.com";
const APP_TOKEN = process.env.SUMSUB_RELAY_APP_TOKEN ?? "";
const SECRET_KEY = process.env.SUMSUB_RELAY_SECRET_KEY ?? "";
const LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME ?? "id-only";

function sign(ts: string, method: string, path: string, body: string): string {
  return createHmac("sha256", SECRET_KEY)
    .update(ts + method + path)
    .update(body)
    .digest("hex");
}

async function sumsubRequest(method: string, path: string, body?: unknown): Promise<Response> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = body ? JSON.stringify(body) : "";

  return fetch(BASE_URL + path, {
    method,
    headers: {
      "X-App-Token": APP_TOKEN,
      "X-App-Access-Sig": sign(ts, method, path, payload),
      "X-App-Access-Ts": ts,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload || undefined,
  });
}

export async function createApplicant(uid: string): Promise<void> {
  const path = `/resources/applicants?levelName=${encodeURIComponent(LEVEL_NAME)}`;
  const resp = await sumsubRequest("POST", path, { externalUserId: uid });
  if (resp.status === 201 || resp.status === 409) return;
  const text = await resp.text();
  if (resp.status >= 400 && resp.status < 500 && text.includes("already exists")) return;
  throw new Error(`sumsub: create applicant failed with status ${resp.status}`);
}

export async function mintAccessToken(uid: string): Promise<string> {
  const path = `/resources/accessTokens?userId=${encodeURIComponent(uid)}&levelName=${encodeURIComponent(LEVEL_NAME)}&ttlInSecs=600`;
  const resp = await sumsubRequest("POST", path);
  if (!resp.ok) {
    throw new Error(`sumsub: mint token failed with status ${resp.status}`);
  }
  const data = (await resp.json()) as { token: string };
  return data.token;
}
