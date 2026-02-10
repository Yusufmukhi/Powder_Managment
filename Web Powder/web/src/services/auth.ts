import { Role } from "../context/session.context";
import { supabase } from "../lib/supabase"

export async function loginUser(username: string, password: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, company_id, username, role, full_name, password")
    .eq("username", username)
    .single();

  if (error || !user) {
    throw new Error("User not found");
  }

  // Compare password (you must use bcrypt compare)
  const bcrypt = await import('bcryptjs');
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw new Error("Invalid password");
  }

  return {
    userId: user.id,
    companyId: user.company_id,
    username: user.username,
    role: user.role as Role,
    fullName: user.full_name || "",
  };
}
