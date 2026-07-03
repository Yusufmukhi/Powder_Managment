import { Role } from "../context/session.context";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export type LoginResult = {
  userId: string;
  companyId: string;
  username: string;
  role: Role;
  fullName: string;
  sessionToken: string;
};

export async function loginUser(
  username: string,
  password: string
): Promise<LoginResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Login failed");
  }

  return {
    userId: data.userId,
    companyId: data.companyId,
    username: data.username,
    role: data.role as Role,
    fullName: data.fullName || "",
    sessionToken: data.sessionToken,
  };
}
