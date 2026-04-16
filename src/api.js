// ─── Google Apps Script API wrapper ──────────────────────────────────────────
// All requests use GET to avoid the 302-redirect body-loss issue with Apps Script.

const BASE = import.meta.env.VITE_APPS_SCRIPT_URL;

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function get(params) {
  const url = new URL(BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return fetch(url.toString(), { redirect: "follow" }).then((r) => r.json());
}

export async function fetchAll() {
  const res = await get({ action: "all" });
  // Flatten: { ok, data: { teachers, classes, ... } } → { ok, teachers, classes, ... }
  if (res.ok && res.data) return { ok: true, ...res.data };
  return res;
}

export async function login(email, pw) {
  return get({
    action: "login",
    email: email.toLowerCase().trim(),
    pwHash: await sha256(pw),
  });
}

export async function signup(email, pw) {
  return get({
    action: "signup",
    email: email.toLowerCase().trim(),
    pwHash: await sha256(pw),
  });
}

export function apiAdd(col, data) {
  return get({ action: "add", col, data: JSON.stringify(data) });
}

export function apiUpdate(col, id, patch) {
  return get({ action: "update", col, id, data: JSON.stringify(patch) });
}

export function apiDelete(col, id) {
  return get({ action: "delete", col, id });
}

export function apiSetting(key, value) {
  return get({ action: "setting", key, value: JSON.stringify(value) });
}
