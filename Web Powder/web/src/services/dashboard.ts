// src/services/dashboard.ts
import { supabase } from "../lib/supabase";

export async function loadKpis(companyId: string) {
  const { data: batches } = await supabase
    .from("stock_batches")
    .select("qty_remaining, rate_per_kg")
    .eq("company_id", companyId);

  const totalStock = batches?.reduce((s, b) => s + Number(b.qty_remaining ?? 0), 0) ?? 0;

  const totalValue = batches?.reduce(
    (s, b) => s + Number(b.qty_remaining ?? 0) * Number(b.rate_per_kg ?? 0),
    0
  ) ?? 0;

  const start = new Date();
  start.setDate(1);

  const { data: usage } = await supabase
    .from("usage")
    .select("quantity_kg")
    .eq("company_id", companyId)
    .gte("used_at", start.toISOString());

  const usedThisMonth = usage?.reduce((s, u) => s + Number(u.quantity_kg ?? 0), 0) ?? 0;

  return { totalStock, totalValue, usedThisMonth };
}

export async function loadInventoryGrouped(companyId: string) {
  const { data } = await supabase
    .from("stock_batches")
    .select(`
      qty_remaining,
      rate_per_kg,
      powder:powders!inner (powder_name)
    `)
    .eq("company_id", companyId)
    .gt("qty_remaining", 0);

  const grouped: Record<string, { qty: number; value: number }> = {};

  data?.forEach((row: any) => {
    const powder = row.powder?.powder_name ?? "—";
    const qty = Number(row.qty_remaining ?? 0);
    const value = qty * Number(row.rate_per_kg ?? 0);

    if (!grouped[powder]) {
      grouped[powder] = { qty: 0, value: 0 };
    }

    grouped[powder].qty += qty;
    grouped[powder].value += value;
  });

  return Object.entries(grouped).map(([powder, v]) => ({
    powder,
    qty: v.qty.toFixed(1),
    value: v.value.toFixed(2),
  }));
}

export async function loadRecentActivity(companyId: string) {
  const { data } = await supabase
    .from("activity_log")
    .select("created_at, event_type, ref_type, meta")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    data?.map((r) => ({
      time: new Date(r.created_at).toLocaleString(),
      event: r.event_type,
      module: r.ref_type,
      description: JSON.stringify(r.meta ?? {}),
    })) ?? []
  );
}

export async function loadUsageByPowder(
  companyId: string,
  powderName: string,
  from: string,
  to: string
) {
  let fromDate = new Date(from);
  let toDate = new Date(to);

  if (fromDate > toDate) {
    [fromDate, toDate] = [toDate, fromDate];
  }

  const fromStr = `${fromDate.toISOString().slice(0, 10)} 00:00:00`;
  const toStr = `${toDate.toISOString().slice(0, 10)} 23:59:59`;

  const { data: powder } = await supabase
    .from("powders")
    .select("id")
    .eq("company_id", companyId)
    .ilike("powder_name", powderName.trim())
    .maybeSingle();

  if (!powder?.id) return [];

  const { data, error } = await supabase
    .from("usage")
    .select(`
      used_at,
      quantity_kg,
      total_cost,
      supplier:suppliers!inner (supplier_name),
      client:clients!inner (client_name)
    `)
    .eq("company_id", companyId)
    .eq("powder_id", powder.id)
    .gte("used_at", fromStr)
    .lte("used_at", toStr)
    .order("used_at", { ascending: false });

  if (error) {
    console.error("Usage load failed:", error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    date: new Date(row.used_at).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    supplier: row.supplier?.supplier_name ?? "—",
    client: row.client?.client_name ?? "—",
    qty: Number(row.quantity_kg ?? 0),
    cost: Number(row.total_cost ?? 0),
  }));
}

export async function loadStockByPowder(
  companyId: string,
  powderName: string,
  from: string,
  to: string
) {
  const { data: powder, error: powderError } = await supabase
    .from("powders")
    .select("id, powder_name")
    .eq("company_id", companyId)
    .ilike("powder_name", powderName.trim())
    .maybeSingle();

  if (powderError) {
    console.error("Error looking up powder:", powderError.message);
    return [];
  }

  if (!powder) {
    console.warn(`No powder found with name: "${powderName}"`);
    return [];
  }

  const { data, error } = await supabase
    .from("stock_batches")
    .select(`
      received_at,
      qty_received,
      rate_per_kg,
      supplier:suppliers!inner (supplier_name)
    `)
    .eq("company_id", companyId)
    .eq("powder_id", powder.id)
    .gte("received_at", `${from}T00:00:00`)
    .lte("received_at", `${to}T23:59:59`)
    .order("received_at", { ascending: false });

  if (error) {
    console.error("Failed to load stock batches:", error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    date: new Date(row.received_at).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    supplier: row.supplier?.supplier_name ?? "—",
    qty: Number(row.qty_received ?? 0),
    rate: Number(row.rate_per_kg ?? 0),
    value: Number(row.qty_received ?? 0) * Number(row.rate_per_kg ?? 0),
  }));
}