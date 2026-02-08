import { supabase } from "../lib/supabase"

export async function loginUser(username: string, password: string) {
  // 1️⃣ fetch user record
  const { data, error } = await supabase
    .from("users")
    .select("id, company_id, role, password, must_change_password")
    .eq("username", username)
    .single()

  if (error || !data) {
    throw new Error("Invalid username or password")
  }

  // ⚠️ Password check should be done via Edge Function later
  // TEMP (development): allow login if user exists
  return {
    userId: data.id,
    companyId: data.company_id,
    role: data.role,
    mustChangePassword: data.must_change_password
  }
}
