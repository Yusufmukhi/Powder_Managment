import { supabase } from "../lib/supabase"

export async function loadPowders(companyId: string) {
  const { data, error } = await supabase
    .from("powders")
    .select("id, powder_name")
    .eq("company_id", companyId)
    .order("powder_name")

  if (error) throw error
  return data
}

export async function loadSuppliers(companyId: string) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_name")
    .eq("company_id", companyId)
    .order("supplier_name")

  if (error) throw error
  return data
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
      powders ( powder_name ),
      suppliers ( supplier_name )
    `)
    .eq("company_id", companyId)
    .order("received_at", { ascending: false })
    .limit(50)

  if (error) throw error

  return data.map(b => ({
    id: b.id,
    powder:  b.powders?.powder_name ?? "",
supplier:
b.suppliers?.supplier_name ?? ""
,

    received: new Date(b.received_at).toLocaleDateString(),
    qty_received: b.qty_received,
    qty_remaining: b.qty_remaining,
    rate: b.rate_per_kg,
    editable: b.qty_remaining === b.qty_received
  }))
}


export async function addStockBatch({
  companyId,
  powderId,
  supplierId,
  qty,
  rate,
  userId
}: {
  companyId: string
  powderId: string
  supplierId: string
  qty: number
  rate: number
  userId: string
}) {
  const { error } = await supabase.from("stock_batches").insert({
    company_id: companyId,
    powder_id: powderId,
    supplier_id: supplierId,
    qty_received: qty,
    qty_remaining: qty,
    rate_per_kg: rate,
    created_by: userId
  })

  if (error) throw error
}
// EDIT batch
export async function updateStockBatch({
  batchId,
  qty,
  rate
}: {
  batchId: string
  qty: number
  rate: number
}) {
  const { error } = await supabase
    .from("stock_batches")
    .update({
      qty_received: qty,
      qty_remaining: qty,
      rate_per_kg: rate
    })
    .eq("id", batchId)

  if (error) throw error
}

// DELETE batch
export async function deleteStockBatch(batchId: string) {
  const { error } = await supabase
    .from("stock_batches")
    .delete()
    .eq("id", batchId)

  if (error) throw error
}
