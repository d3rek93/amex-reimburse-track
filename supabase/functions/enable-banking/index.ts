import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

const API = "https://api.enablebanking.com";
const APP_ID = Deno.env.get("ENABLE_BANKING_APPLICATION_ID") ?? "";
const PRIVATE_KEY = Deno.env.get("ENABLE_BANKING_PRIVATE_KEY") ?? "";
// The app URL registered as redirect in the Enable Banking control panel.
const REDIRECT_URL = `${(Deno.env.get("APP_URL") ?? "").replace(/\/$/, "")}/bank-callback`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Secrets can arrive with literal "\n" instead of real newlines.
function normalizePem(raw: string) {
  let pem = raw.trim();
  if (!pem.includes("\n") && pem.includes("\\n")) {
    pem = pem.replace(/\\n/g, "\n");
  }
  return pem;
}

let cachedToken = "";
let cachedTokenUntil = 0;

async function ebToken(): Promise<string> {
  if (cachedToken && Math.floor(Date.now() / 1000) < cachedTokenUntil - 60) {
    return cachedToken;
  }
  if (!APP_ID || !PRIVATE_KEY) {
    throw new Error("Enable Banking credentials are not configured");
  }
  const key = await importPKCS8(normalizePem(PRIVATE_KEY), "RS256");
  const iat = Math.floor(Date.now() / 1000);
  cachedToken = await new SignJWT({
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat,
    exp: iat + 3600,
  })
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: APP_ID })
    .sign(key);
  cachedTokenUntil = iat + 3600;
  return cachedToken;
}

async function eb(path: string, init: RequestInit = {}) {
  const t = await ebToken();
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Enable Banking ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body.action ?? "");

    if (action === "aspsps") {
      const country = String(body.country ?? "FR").slice(0, 2).toUpperCase();
      const data = await eb(`/aspsps?country=${encodeURIComponent(country)}`);
      const aspsps = (data.aspsps ?? []).map((a: Record<string, unknown>) => ({
        name: a.name,
        country: a.country,
        id: a.id,
      }));
      return json({ aspsps });
    }

    if (action === "start") {
      const aspspName = String(body.aspspName ?? "").slice(0, 120);
      const country = String(body.country ?? "FR").slice(0, 2).toUpperCase();
      if (!aspspName) return json({ error: "aspspName is required" }, 400);
      const validUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      const state = crypto.randomUUID();
      const data = await eb("/auth", {
        method: "POST",
        body: JSON.stringify({
          access: { valid_until: validUntil },
          aspsp: { name: aspspName, country },
          state,
          redirect_url: REDIRECT_URL,
          psu_type: "personal",
        }),
      });
      return json({ url: data.url, state, validUntil });
    }

    if (action === "session") {
      const code = String(body.code ?? "");
      if (!code) return json({ error: "code is required" }, 400);
      const session = await eb("/sessions", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      const sessionId = session.session_id ?? session.id;
      if (!sessionId) return json({ error: "No session id returned" }, 502);
      const rawAccounts = (session.accounts ?? []) as Array<Record<string, any>>;
      const accounts = rawAccounts.map((a) => ({
        uid: a.uid,
        iban: a.account_id?.iban ?? a.iban,
        name: a.name,
        product: a.product,
        currency: a.currency,
        usage: a.usage,
        // Several accounts: the user picks which ones to follow.
        enabled: rawAccounts.length === 1,
      }));
      const aspspName = session.aspsp?.name ?? session.aspsp_name ?? null;
      const { error: upError } = await client
        .from("bank_sessions")
        .upsert(
          {
            user_id: userId,
            session_id: sessionId,
            aspsp_name: aspspName,
            country: session.aspsp?.country ?? session.country ?? null,
            accounts,
            valid_until: session.access?.valid_until ?? session.access_details?.valid_until ?? null,
          },
          { onConflict: "user_id,session_id" }
        );
      if (upError) {
        console.error("bank_sessions upsert failed", upError);
      }
      return json({ session_id: sessionId, accounts, aspsp_name: aspspName });
    }

    if (action === "set_accounts") {
      const sessionId = String(body.session_id ?? "");
      const enabledUids = new Set((body.uids ?? []).map(String));
      const { data: row, error } = await client
        .from("bank_sessions")
        .select("accounts")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error || !row) return json({ error: error?.message ?? "Session not found" }, 404);
      const accounts = ((row.accounts ?? []) as Array<Record<string, unknown>>).map((a) => ({
        ...a,
        enabled: enabledUids.has(String(a.uid)),
      }));
      const { error: upErr } = await client
        .from("bank_sessions")
        .update({ accounts })
        .eq("user_id", userId)
        .eq("session_id", sessionId);
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true, accounts });
    }

    if (action === "status") {
      const { data, error } = await client
        .from("bank_sessions")
        .select("session_id, aspsp_name, country, accounts, valid_until, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ sessions: data ?? [] });
    }

    if (action === "sync") {
      const days = Math.min(Math.max(Number(body.days ?? 120), 1), 540);
      const dateFrom = new Date(Date.now() - days * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);

      const { data: rows, error } = await client
        .from("bank_sessions")
        .select("session_id, aspsp_name, accounts")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);

      const results: unknown[] = [];
      const errors: string[] = [];
      for (const row of rows ?? []) {
        for (const account of (row.accounts ?? []) as Array<Record<string, unknown>>) {
          const uid = String(account.uid ?? "");
          if (!uid || account.enabled === false) continue;
          try {
            const balances = await eb(
              `/accounts/${encodeURIComponent(uid)}/balances`
            );
            const transactions = await eb(
              `/accounts/${encodeURIComponent(
                uid
              )}/transactions?date_from=${dateFrom}`
            );
            results.push({
              session_id: row.session_id,
              aspsp_name: row.aspsp_name ?? null,
              account,
              balances,
              transactions: transactions.transactions ?? [],
              next_uri: transactions.next_uri ?? null,
            });
          } catch (err) {
            errors.push(`${uid}: ${(err as Error).message}`);
          }
        }
      }
      console.log("sync results", JSON.stringify(results).slice(0, 2000));
      return json({ results, errors, dateFrom });
    }

    if (action === "forget") {
      const { error } = await client
        .from("bank_sessions")
        .delete()
        .eq("user_id", userId)
        .match(body.session_id ? { session_id: String(body.session_id) } : {});
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = (err as Error).message ?? "Unexpected error";
    console.error("enable-banking error", message);
    return json({ error: message }, 500);
  }
});
