import { supabase } from "../lib/supabase";

export async function loadPowders(companyId: string) {
  const { data, error } = await supabase
    .from("powders")
    .select("id, powder_name")
    .eq("company_id", companyId)
    .order("powder_name");

  if (error) throw error;
  return data ?? [];
}

export async function loadSuppliers(companyId: string) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_name")
    .eq("company_id", companyId)
    .order("supplier_name");

  if (error) throw error;
  return data ?? [];
}

export async function loadRecentBatches(companyId: string) {
  const { data, error } = await supabase
    .from("stock_batches")
    .select(`
      id,
      qty_received,
      qty_remaining,
      rate_per_kg,
      received_at,
      powder:powders!inner (powder_name),
      supplier:suppliers!inner (supplier_name)
    `)
    .eq("company_id", companyId)
    .order("received_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((b: any) => ({
    id: b.id,
    powder: b.powder?.powder_name ?? "—",
    supplier: b.supplier?.supplier_name ?? "—",
    received: new Date(b.received_at).toLocaleDateString(),
    qty_received: b.qty_received,
    qty_remaining: b.qty_remaining,
    rate: b.rate_per_kg,
    editable: b.qty_remaining === b.qty_received,
  }));
}

export async function addStockBatch({
  companyId,
  powderId,
  supplierId,
  qty,
  rate,
  userId,
}: {
  companyId: string;
  powderId: string;
  supplierId: string;
  qty: number;
  rate: number;
  userId: string;
}) {
  const { error } = await supabase.from("stock_batches").insert({
    company_id: companyId,
    powder_id: powderId,
    supplier_id: supplierId,
    qty_received: qty,
    qty_remaining: qty,
    rate_per_kg: rate,
    created_by: userId,
  });

  if (error) throw error;
}

export async function updateStockBatch({
  batchId,
  qty,
  rate,
  supplierId,
}: {
  batchId: string;
  qty: number;
  rate: number;
  supplierId: string;
}) {
  if (!qty || qty <= 0) {
    throw new Error("Invalid quantity");
  }

  const { data: batch, error: fetchError } = await supabase
    .from("stock_batches")
    .select("qty_received, qty_remaining")
    .eq("id", batchId)
    .single();

  if (fetchError || !batch) throw fetchError || new Error("Batch not found");

  if (batch.qty_received !== batch.qty_remaining) {
    throw new Error("Cannot edit stock after usage");
  }

  const { error } = await supabase
    .from("stock_batches")
    .update({
      qty_received: qty,
      qty_remaining: qty,
      rate_per_kg: rate,
      supplier_id: supplierId,
    })
    .eq("id", batchId);

  if (error) throw error;
}

export async function deleteStockBatch(batchId: string) {
  const { error } = await supabase
    .from("stock_batches")
    .delete()
    .eq("id", batchId);

  if (error) throw error;
}