import { useEffect, useState } from "react";
import { useSession } from "../context/useSession";
import SearchSelect from "../components/SearchSelect";
import DataTable from "../components/DataTable";
import { supabase } from "../lib/supabase";

type Option = {
  id: string;
  label: string;
};

type UsageRow = {
  id: string;
  used_at: string;
  powder_id: string;
  supplier_id: string;
  client_id: string;
  powder: string;
  supplier: string;
  client: string;
  qty: number;
  cost: number;
};

export default function Usage() {
  const { session } = useSession();

  const [powders, setPowders] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);

  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);

  const [powder, setPowder] = useState<Option | null>(null);
  const [supplier, setSupplier] = useState<Option | null>(null);
  const [client, setClient] = useState<Option | null>(null);
  const [qty, setQty] = useState("");

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ────────────────────────────────────────────────
  // LOAD ALL POWDERS (so edit always finds them)
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.companyId) return;

    supabase
      .from("powders")
      .select("id, powder_name")
      .eq("company_id", session.companyId)
      .order("powder_name")
      .then(({ data, error }) => {
        if (error) {
          console.error("Powders load error:", error);
          return;
        }
        setPowders(
          data?.map((p) => ({ id: p.id, label: p.powder_name.trim() })) ?? []
        );
      });

    refreshUsage();
  }, [session?.companyId]);

  // ────────────────────────────────────────────────
  // LOAD SUPPLIERS WHEN POWDER CHANGES + AUTO-SELECT ON EDIT
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!powder?.id || !session?.companyId) {
      setSuppliers([]);
      if (!editingId) setSupplier(null);
      return;
    }

    supabase
      .from("stock_batches")
      .select("supplier_id, suppliers ( supplier_name )")
      .eq("company_id", session.companyId)
      .eq("powder_id", powder.id)
      .gt("qty_remaining", 0)
      .then(({ data, error }) => {
        if (error) {
          console.error("Suppliers load error:", error);
          setSuppliers([]);
          return;
        }

        const map = new Map<string, string>();
        data?.forEach((r) => {
          const name = r.suppliers?.[0]?.supplier_name?.trim();
          if (name && r.supplier_id) {
            map.set(r.supplier_id, name);
          }
        });

        const options = Array.from(map.entries()).map(([id, label]) => ({
          id,
          label,
        }));

        setSuppliers(options);

        // If in edit mode → select supplier by ID
        if (editingId) {
          const row = usageRows.find((r) => r.id === editingId);
          if (row?.supplier_id) {
            const match = options.find((opt) => opt.id === row.supplier_id);
            if (match) {
              setSupplier(match);
            } else if (options.length > 0) {
              // fallback if supplier has no remaining stock now
              console.warn("Supplier ID not in current options → using first", {
                wantedId: row.supplier_id,
                available: options.map((o) => o.id),
              });
              setSupplier(options[0]);
            }
          }
        }
      });
  }, [powder?.id, session?.companyId, editingId, usageRows]);

  // ────────────────────────────────────────────────
  // LOAD CLIENTS
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.companyId) return;

    supabase
      .from("clients")
      .select("id, client_name")
      .eq("company_id", session.companyId)
      .order("client_name")
      .then(({ data, error }) => {
        if (error) {
          console.error("Clients load error:", error);
          return;
        }
        setClients(
          data?.map((c) => ({ id: c.id, label: c.client_name.trim() })) ?? []
        );
      });
  }, [session?.companyId]);

  // ────────────────────────────────────────────────
  // REFRESH USAGE TABLE
  // ────────────────────────────────────────────────
  const refreshUsage = async () => {
    if (!session?.companyId) return;

    const { data, error } = await supabase
      .from("usage")
      .select("id, used_at, quantity_kg, total_cost, powder_id, supplier_id, client_id")
      .eq("company_id", session.companyId)
      .order("used_at", { ascending: false });

    if (error || !data) {
      console.error("Usage refresh error:", error);
      return;
    }

    const [pRes, sRes, cRes] = await Promise.all([
      supabase.from("powders").select("id, powder_name"),
      supabase.from("suppliers").select("id, supplier_name"),
      supabase.from("clients").select("id, client_name"),
    ]);

    const pMap = new Map(pRes.data?.map((p) => [p.id, p.powder_name]) ?? []);
    const sMap = new Map(sRes.data?.map((s) => [s.id, s.supplier_name]) ?? []);
    const cMap = new Map(cRes.data?.map((c) => [c.id, c.client_name]) ?? []);

    setUsageRows(
      data.map((u) => ({
        id: u.id,
        used_at: new Date(u.used_at).toLocaleString(),
        powder_id: u.powder_id,
        supplier_id: u.supplier_id,
        client_id: u.client_id,
        powder: pMap.get(u.powder_id) ?? "—",
        supplier: sMap.get(u.supplier_id) ?? "—",
        client: cMap.get(u.client_id) ?? "—",
        qty: u.quantity_kg ?? 0,
        cost: u.total_cost ?? 0,
      }))
    );
  };

  // ────────────────────────────────────────────────
  // START EDIT – simple & reliable
  // ────────────────────────────────────────────────
  const startEdit = (row: UsageRow) => {
    setEditingId(row.id);
    setQty(row.qty.toString());

    // Powder (must exist since we load all)
    const p = powders.find((opt) => opt.id === row.powder_id);
    if (p) {
      setPowder(p);
      // suppliers + auto-select happen in useEffect
    } else {
      console.warn("Powder ID not found in loaded list", row.powder_id);
    }

    // Client
    const c = clients.find((opt) => opt.id === row.client_id);
    if (c) setClient(c);
  };

  // FIFO, saveUsage, cancelUsage remain mostly unchanged
  // (keeping them as-is since they were not the issue)

  const applyFIFO = async (
    usageId: string,
    powderId: string,
    supplierId: string,
    quantity: number
  ) => {
    let remaining = quantity;
    let totalCost = 0;

    const { data: batches } = await supabase
      .from("stock_batches")
      .select("id, qty_remaining, rate_per_kg")
      .eq("company_id", session?.companyId)
      .eq("powder_id", powderId)
      .eq("supplier_id", supplierId)
      .gt("qty_remaining", 0)
      .order("received_at", { ascending: true });

    for (const b of batches ?? []) {
      if (remaining <= 0) break;
      const used = Math.min(b.qty_remaining, remaining);
      totalCost += used * (b.rate_per_kg ?? 0);

      await supabase.from("stock_batches").update({
        qty_remaining: b.qty_remaining - used,
      }).eq("id", b.id);

      await supabase.from("usage_fifo").insert({
        company_id: session?.companyId,
        usage_id: usageId,
        stock_batch_id: b.id,
        qty_used: used,
        rate_per_kg: b.rate_per_kg ?? 0,
      });

      remaining -= used;
    }

    if (totalCost > 0) {
      await supabase.from("usage").update({ total_cost: totalCost }).eq("id", usageId);
    }
  };

  const saveUsage = async () => {
    if (!powder || !supplier || !client || !qty.trim()) {
      alert("All fields are required");
      return;
    }

    const quantity = Number(qty);
    if (isNaN(quantity) || quantity <= 0) {
      alert("Invalid quantity");
      return;
    }

    setLoading(true);
    try {
      let usageId = editingId;

      if (editingId) {
        const { data: fifo } = await supabase
          .from("usage_fifo")
          .select("stock_batch_id, qty_used")
          .eq("usage_id", editingId);

        for (const f of fifo ?? []) {
          await supabase.rpc("increment_stock", {
            batch_id: f.stock_batch_id,
            qty: f.qty_used,
          });
        }

        await supabase.from("usage_fifo").delete().eq("usage_id", editingId);

        await supabase
          .from("usage")
          .update({ quantity_kg: quantity })
          .eq("id", editingId);
      } else {
        const { data } = await supabase
          .from("usage")
          .insert({
            company_id: session?.companyId,
            powder_id: powder.id,
            supplier_id: supplier.id,
            client_id: client.id,
            quantity_kg: quantity,
            created_by: session?.userId,
          })
          .select()
          .single();

        usageId = data?.id;
        if (!usageId) throw new Error("Insert failed");
      }

      await applyFIFO(usageId, powder.id, supplier.id, quantity);

      setPowder(null);
      setSupplier(null);
      setClient(null);
      setQty("");
      setEditingId(null);

      refreshUsage();
    } catch (err) {
      console.error(err);
      alert("Error saving usage");
    } finally {
      setLoading(false);
    }
  };

  const cancelUsage = async (row: UsageRow) => {
    if (!confirm("Cancel this usage and restore stock?")) return;

    try {
      const { data: fifo } = await supabase
        .from("usage_fifo")
        .select("stock_batch_id, qty_used")
        .eq("usage_id", row.id);

      for (const f of fifo ?? []) {
        await supabase.rpc("increment_stock", {
          batch_id: f.stock_batch_id,
          qty: f.qty_used,
        });
      }

      await supabase.from("usage_fifo").delete().eq("usage_id", row.id);
      await supabase.from("usage").delete().eq("id", row.id);

      refreshUsage();
    } catch (err) {
      console.error(err);
      alert("Failed to cancel");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-4">
          {editingId ? "Edit Usage" : "Add Usage"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative group">
            <SearchSelect
              placeholder="Powder"
              options={powders}
              value={powder}
              disabled={!!editingId}
              onChange={(v) => {
                if (editingId) return;
                setPowder(v);
                setSupplier(null);
              }}
              className={editingId ? "cursor-not-allowed" : ""}
            />
            {editingId && (
              <div className="absolute inset-0 cursor-not-allowed" />
            )}
            {editingId && (
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block bg-red-600 text-white text-xs px-2 py-1 rounded shadow z-50 whitespace-nowrap">
                Can’t change powder while editing
              </div>
            )}
          </div>

          <div className="relative group">
            <SearchSelect
              placeholder="Supplier"
              options={suppliers}
              value={supplier}
              disabled={!!editingId}
              onChange={(v) => {
                if (editingId) return;
                setSupplier(v);
              }}
              className={editingId ? "cursor-not-allowed" : ""}
            />
            {editingId && (
              <div className="absolute inset-0 cursor-not-allowed" />
            )}
            {editingId && (
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block bg-red-600 text-white text-xs px-2 py-1 rounded shadow z-50 whitespace-nowrap">
                Can’t change supplier while editing
              </div>
            )}
          </div>

          <SearchSelect
            placeholder="Client"
            options={clients}
            value={client}
            onChange={setClient}
          />

          <input
            className="border p-2 rounded"
            placeholder="Qty (kg)"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            type="number"
            step="any"
          />
        </div>

        <div className="mt-4">
          <button
            onClick={saveUsage}
            disabled={loading}
            className="bg-blue-600 text-white px-5 py-2 rounded disabled:opacity-60"
          >
            {loading ? "Processing..." : editingId ? "Save Changes" : "Add Usage"}
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-3">Recent Usage</h2>

        <DataTable
          columns={[
            { key: "used_at", label: "Date" },
            { key: "powder", label: "Powder" },
            { key: "supplier", label: "Supplier" },
            { key: "client", label: "Client" },
            { key: "qty", label: "Qty" },
            { key: "cost", label: "Cost" },
            {
              key: "actions",
              label: "Actions",
              render: (row: UsageRow) => (
                <div className="flex gap-3">
                  <button
                    onClick={() => startEdit(row)}
                    className="text-blue-600 text-sm hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => cancelUsage(row)}
                    className="text-red-600 text-sm hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ),
            },
          ]}
          data={usageRows}
          pageSize={6}
          height="h-80"
        />
      </div>
    </div>
  );
}