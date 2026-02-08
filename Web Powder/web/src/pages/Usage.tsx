  import { useEffect, useState } from "react"
  import { useSession } from "../context/useSession"
  import SearchSelect from "../components/SearchSelect"
  import DataTable from "../components/DataTable"
  import { supabase } from "../lib/supabase"

  type Option = {
    id: string
    label: string
  }

  type UsageRow = {
    id: string
    used_at: string
    powder: string
    supplier: string
    client: string
    qty: number
    cost: number
  }

  export default function Usage() {
    const { session } = useSession()

    // dropdowns
    const [powders, setPowders] = useState<Option[]>([])
    const [suppliers, setSuppliers] = useState<Option[]>([])
    const [clients, setClients] = useState<Option[]>([])

    // table
    const [usageRows, setUsageRows] = useState<UsageRow[]>([])

    // form
    const [powder, setPowder] = useState<Option | null>(null)
    const [supplier, setSupplier] = useState<Option | null>(null)
    const [client, setClient] = useState<Option | null>(null)
    const [qty, setQty] = useState("")
    const [loading, setLoading] = useState(false)

    // edit state
    const [editingId, setEditingId] = useState<string | null>(null)

    // ------------------------------------------------
    // LOAD POWDERS WITH AVAILABLE STOCK
    // ------------------------------------------------
    useEffect(() => {
      if (!session.companyId) return

      supabase
        .from("stock_batches")
        .select("powder_id, powders ( powder_name )")
        .eq("company_id", session.companyId)
        .gt("qty_remaining", 0)
        .then(({ data }) => {
          if (!data) return

          const map = new Map<string, string>()
          data.forEach(r => {
            if (r.powders)
              map.set(r.powder_id, r.powders?.[0]?.powder_name)
          })

          setPowders(
            Array.from(map.entries()).map(([id, label]) => ({
              id,
              label
            }))
          )
        })

      refreshUsage()
    }, [session.companyId])

    // ------------------------------------------------
    // LOAD SUPPLIERS FOR POWDER
    // ------------------------------------------------
    useEffect(() => {
      if (!powder) {
        setSuppliers([])
        setSupplier(null)
        return
      }

      supabase
        .from("stock_batches")
        .select("supplier_id, suppliers ( supplier_name )")
        .eq("company_id", session.companyId)
        .eq("powder_id", powder.id)
        .gt("qty_remaining", 0)
        .then(({ data }) => {
          if (!data) return

          const map = new Map<string, string>()
          data.forEach(r => {
            if (r.suppliers)
              map.set(r.supplier_id, r.suppliers?.[0]?.supplier_name)
          })

          setSuppliers(
            Array.from(map.entries()).map(([id, label]) => ({
              id,
              label
            }))
          )
        })
    }, [powder, session.companyId])

    // ------------------------------------------------
    // LOAD CLIENTS
    // ------------------------------------------------
    useEffect(() => {
      if (!session.companyId) return

      supabase
        .from("clients")
        .select("id, client_name")
        .eq("company_id", session.companyId)
        .order("client_name")
        .then(({ data }) => {
          if (!data) return
          setClients(
            data.map(c => ({
              id: c.id,
              label: c.client_name
            }))
          )
        })
    }, [session.companyId])

    // ------------------------------------------------
    // LOAD USAGE TABLE
    // ------------------------------------------------
    const refreshUsage = async () => {
      const { data } = await supabase
        .from("usage")
        .select(`
          id,
          quantity_kg,
          total_cost,
          used_at,
          powders ( powder_name ),
          suppliers ( supplier_name ),
          clients ( client_name )
        `)
        .eq("company_id", session.companyId)
        .order("used_at", { ascending: false })

      if (!data) return

      setUsageRows(
        data.map(u => ({
          id: u.id,
          used_at: new Date(u.used_at).toLocaleString(),
          powder: u.powders?.powder_name ?? "",
supplier: u.suppliers?.supplier_name ?? "",
client: u.clients?.client_name ?? "",

          qty: u.quantity_kg,
          cost: u.total_cost
        }))
      )
    }

    // ------------------------------------------------
    // FIFO APPLY (USED BY ADD + EDIT)
    // ------------------------------------------------
    const applyFIFO = async (
      usageId: string,
      powderId: string,
      supplierId: string,
      quantity: number
    ) => {
      let remaining = quantity
      let totalCost = 0

      const { data: batches } = await supabase
        .from("stock_batches")
        .select("id, qty_remaining, rate_per_kg")
        .eq("company_id", session.companyId)
        .eq("powder_id", powderId)
        .eq("supplier_id", supplierId)
        .gt("qty_remaining", 0)
        .order("received_at", { ascending: true })

      for (const b of batches ?? []) {
        if (remaining <= 0) break

        const used = Math.min(b.qty_remaining, remaining)
        totalCost += used * b.rate_per_kg

        await supabase
          .from("stock_batches")
          .update({ qty_remaining: b.qty_remaining - used })
          .eq("id", b.id)

        await supabase.from("usage_fifo").insert({
          company_id: session.companyId,
          usage_id: usageId,
          stock_batch_id: b.id,
          qty_used: used,
          rate_per_kg: b.rate_per_kg
        })

        remaining -= used
      }

      await supabase
        .from("usage")
        .update({ total_cost: totalCost })
        .eq("id", usageId)
    }

    // ------------------------------------------------
    // ADD / EDIT USAGE
    // ------------------------------------------------
    const saveUsage = async () => {
      if (!powder || !supplier || !client || !qty) {
        alert("All fields required")
        return
      }

      const quantity = Number(qty)
      if (quantity <= 0) return alert("Invalid quantity")

      setLoading(true)

      try {
        let usageId = editingId

        if (editingId) {
          // rollback old FIFO
          const { data: fifo } = await supabase
            .from("usage_fifo")
            .select("stock_batch_id, qty_used")
            .eq("usage_id", editingId)

          for (const f of fifo ?? []) {
            await supabase.rpc("increment_stock", {
              batch_id: f.stock_batch_id,
              qty: f.qty_used
            })
          }

          await supabase
            .from("usage_fifo")
            .delete()
            .eq("usage_id", editingId)

          await supabase
            .from("usage")
            .update({ quantity_kg: quantity })
            .eq("id", editingId)
        } else {
          const { data } = await supabase
            .from("usage")
            .insert({
              company_id: session.companyId,
              powder_id: powder.id,
              supplier_id: supplier.id,
              client_id: client.id,
              quantity_kg: quantity,
              created_by: session.userId
            })
            .select()
            .single()

          usageId = data.id
        }

        await applyFIFO(usageId!, powder.id, supplier.id, quantity)

        // reset form
        setPowder(null)
        setSupplier(null)
        setClient(null)
        setQty("")
        setEditingId(null)

        refreshUsage()
      } finally {
        setLoading(false)
      }
    }

    // ------------------------------------------------
    // CANCEL USAGE
    // ------------------------------------------------
    const cancelUsage = async (row: UsageRow) => {
      if (!confirm("Cancel this usage and restore stock?")) return

      const { data: fifo } = await supabase
        .from("usage_fifo")
        .select("stock_batch_id, qty_used")
        .eq("usage_id", row.id)

      for (const f of fifo ?? []) {
        await supabase.rpc("increment_stock", {
          batch_id: f.stock_batch_id,
          qty: f.qty_used
        })
       }

      await supabase.from("usage_fifo").delete().eq("usage_id", row.id)
      await supabase.from("usage").delete().eq("id", row.id)

      refreshUsage()
    }

    // ------------------------------------------------
    // START EDIT (PYTHON STYLE)
    // ------------------------------------------------
    const startEdit = async (row: UsageRow) => {
    setEditingId(row.id)
    setQty(String(row.qty))

    // 1️⃣ lock powder
    const p = powders.find(p => p.label === row.powder)
    if (!p) return
    setPowder(p)

    // 2️⃣ load suppliers for this powder FIRST
    const { data } = await supabase
      .from("stock_batches")
      .select("supplier_id, suppliers ( supplier_name )")
      .eq("company_id", session.companyId)
      .eq("powder_id", p.id)
      .gt("qty_remaining", 0)

    if (!data) return

    const map = new Map<string, string>()
    data.forEach(r => {
      if (r.suppliers)
        map.set(r.supplier_id, r.suppliers?.[0]?.supplier_name)
    })

    const supplierOptions = Array.from(map.entries()).map(
      ([id, label]) => ({ id, label })
    )

    setSuppliers(supplierOptions)

    // 3️⃣ now safely set supplier
    const s = supplierOptions.find(s => s.label === row.supplier)
    if (s) setSupplier(s)
  }




    return (
      <div className="p-4 md:p-6 space-y-6">
        {/* FORM */}
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
      onChange={v => {
        if (editingId) return
        setPowder(v)
        setSupplier(null)
      }}
      className={editingId ? "cursor-not-allowed" : ""}
    />

    {/* 🚫 overlay to force red cursor */}
    {editingId && (
      <div className="absolute inset-0 cursor-not-allowed" />
    )}

    {/* 🟥 hover text */}
    {editingId && (
      <div
        className="
          pointer-events-none
          absolute
          left-1/2
          -translate-x-1/2
          top-full
          mt-1
          hidden
          group-hover:block
          bg-red-600
          text-white
          text-xs
          px-2
          py-1
          rounded
          shadow
          z-50
          whitespace-nowrap
        "
      >
        Can’t change the powder name while editing
      </div>
    )}
  </div>


            <div className="relative group">
    <SearchSelect
      placeholder="Supplier"
      options={suppliers}
      value={supplier}
      disabled={!!editingId}
      onChange={v => {
        if (editingId) return
        setSupplier(v)
      }}
      className={editingId ? "cursor-not-allowed" : ""}
    />

    {/* 🚫 overlay for red cursor */}
    {editingId && (
      <div className="absolute inset-0 cursor-not-allowed" />
    )}

    {/* 🟥 hover text */}
    {editingId && (
      <div
        className="
          pointer-events-none
          absolute
          left-1/2
          -translate-x-1/2
          top-full
          mt-1
          hidden
          group-hover:block
          bg-red-600
          text-white
          text-xs
          px-2
          py-1
          rounded
          shadow
          z-50
          whitespace-nowrap
        "
      >
        Can’t change supplier while editing usage
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
              onChange={e => setQty(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <button
              onClick={saveUsage}
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-2 rounded"
            >
              {loading
                ? "Processing..."
                : editingId
                ? "Save Changes"
                : "Add Usage"}
            </button>
          </div>
        </div>

        {/* TABLE */}
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
      render: (row: any) => row.actions
    }
            ]}
            data={usageRows.map(u => ({
              ...u,
              actions: (
                <div className="flex gap-3">
                  <button
                    onClick={() => startEdit(u)}
                    className="text-blue-600 text-sm hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => cancelUsage(u)}
                    className="text-red-600 text-sm hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )
            }))}
            pageSize={6}
            height="h-80"
          />
        </div>
      </div>
    )
  }
