// supabase/functions/login/index.ts
//
// Server-side login. Runs with the SERVICE ROLE key (never exposed to the
// browser), so the password hash never leaves the server, and every login
// issues a random opaque session token that only this backend can verify.
//
// Deploy with: supabase functions deploy login

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { username, password } = body;

  if (!username || !password) {
    return json({ error: "Username and password are required" }, 400);
  }

  // Service role key: full DB access, bypasses RLS. Only ever used here,
  // server-side. Supabase injects this automatically into Edge Functions.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: user, error } = await supabase
    .from("users")
    .select("id, company_id, username, role, full_name, password")
    .eq("username", username)
    .single();

  if (error || !user) {
    // Same generic message whether the username doesn't exist or the
    // password is wrong - don't reveal which one it was.
    return json({ error: "Invalid username or password" }, 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return json({ error: "Invalid username or password" }, 401);
  }

  // Issue a random opaque session token (not a JWT, not the user's data -
  // just a random ID that maps to a row in `sessions`).
  const sessionToken = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const { error: sessionError } = await supabase.from("sessions").insert({
    token: sessionToken,
    user_id: user.id,
    company_id: user.company_id,
    expires_at: expiresAt.toISOString(),
  });

  if (sessionError) {
    return json({ error: "Could not start session" }, 500);
  }

  return json({
    sessionToken,
    userId: user.id,
    companyId: user.company_id,
    username: user.username,
    role: user.role,
    fullName: user.full_name || "",
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
