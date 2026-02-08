import { supabase } from "../lib/supabase";

export async function recordUsageFIFO(payload: any) {
  const { data, error } = await supabase.rpc(
    "record_usage_fifo",
    payload
  );
  if (error) throw error;
  return data;
}
