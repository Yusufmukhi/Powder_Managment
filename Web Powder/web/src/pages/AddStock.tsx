  import { useEffect, useState } from "react"
  import { useSession } from "../context/useSession"
  import SearchSelect from "../components/SearchSelect"
  import DataTable from "../components/DataTable"
  import {
    loadPowders,
    loadSuppliers,
    loadRecentBatches,
    addStockBatch,
    updateStockBatch,
    deleteStockBatch
  } from "../services/stock"

  type Option = {
    id: string
    label: string
  }

  type BatchRow = {
    id: string
    powder: string
    supplier: string
    received: string
    qty_received: number
    qty_remaining: number
    rate: number
    editable: boolean
  }

  export default function AddStock() {
    const { session } = useSession()

    // master data
    const [powders, setPowders] = useState<Option[]>([])
    const [suppliers, setSuppliers] = useState<Option[]>([])
    const [batches, setBatches] = useState<BatchRow[]>([])

    // form state
    const [powder, setPowder] = useState<Option | null>(null)
    const [supplier, setSupplier] = useState<Option | null>(null)
    const [qty, setQty] = useState("")
    const [rate, setRate] = useState("")
    const [loading, setLoading] = useState(false)

    // edit state
    const [editing, setEditing] = useState<BatchRow | null>(null)

    // -----------------------------------
    // LOAD INITIAL DATA
    // -----------------------------------
    useEffect(() => {
      if (!session.companyId) return

      loadPowders(session.companyId).then(data =>
        setPowders(
          data.map(p => ({
            id: p.id,
            label: p.powder_name
          }))
        )
      )

      loadSuppliers(session.companyId).then(data =>
        setSuppliers(
          data.map(s => ({
            id: s.id,
            label: s.supplier_name
          }))
        )
      )

      refreshBatches()
    }, [session.companyId])

    const refreshBatches = () => {
      if (!session.companyId) return
      loadRecentBatches(session.companyId).then(setBatches)
    }

    // -----------------------------------
    // ADD NEW BATCH
    // -----------------------------------
    const submit = async () => {
      if (!powder || !supplier || !qty || !rate) {
        alert("All fields are required")
        return
      }

      const q = Number(qty)
      const r = Number(rate)

      if (q <= 0 || r <= 0) {
        alert("Quantity and rate must be positive")
        return
      }

      try {
        setLoading(true)

        await addStockBatch({
          companyId: session.companyId!,
          powderId: powder.id,
          supplierId: supplier.id,
          qty: q,
          rate: r,
          userId: session.userId!
        })

        // reset form
        setQty("")
        setRate("")
        setSupplier(null)

        refreshBatches()
      } catch (e: any) {
        alert(e.message)
      } finally {
        setLoading(false)
      }
    }

    // -----------------------------------
    // EDIT EXISTING BATCH
    // -----------------------------------
    const startEdit = (row: BatchRow) => {
  if (!row.editable) {
    alert("This batch has already been used and cannot be edited.")
    return
  }

  setEditing(row)
  setQty(String(row.qty_received))
  setRate(String(row.rate))

  // 🔒 lock powder to batch powder
  const p = powders.find(p => p.label === row.powder)
  if (p) setPowder(p)
}


    const saveEdit = async () => {
      if (!editing) return

      const q = Number(qty)
      const r = Number(rate)

      if (q <= 0 || r <= 0) {
        alert("Invalid values")
        return
      }

      try {
        setLoading(true)

        await updateStockBatch({
          batchId: editing.id,
          qty: q,
          rate: r
        })

        setEditing(null)
        setQty("")
        setRate("")
        refreshBatches()
      } catch (e: any) {
        alert(e.message)
      } finally {
        setLoading(false)
      }
    }

    // -----------------------------------
    // DELETE BATCH
    // -----------------------------------
    const removeBatch = async (row: BatchRow) => {
      if (!row.editable) {
        alert("This batch has already been used and cannot be deleted.")
        return
      }

      if (!confirm("Delete this batch permanently?")) return

      try {
        await deleteStockBatch(row.id)
        refreshBatches()
      } catch (e: any) {
        alert(e.message)
      }
    }

    return (
      <div className="p-4 md:p-6 space-y-6">
        {/* ===============================
            ADD / EDIT FORM
        ================================ */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-4">
            {editing ? "Edit Stock Batch" : "Add Stock (FIFO Receiving)"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* POWDER SEARCH */}
            <div className="relative group">
  <SearchSelect
    placeholder="Select powder"
    options={powders}
    value={powder}
    disabled={!!editing}
    onChange={v => {
      if (editing) return
      setPowder(v)
      setSupplier(null)
    }}
    className={editing ? "cursor-not-allowed" : ""}
  />

  {/* 🚫 Overlay to capture hover */}
  {editing && (
    <div className="absolute inset-0 cursor-not-allowed" />
  )}

  {/* 🟥 HOVER TEXT */}
  {editing && (
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



            {/* SUPPLIER SEARCH */}
            <SearchSelect
              placeholder="Select supplier"
              options={suppliers}
              value={supplier}
              onChange={v => setSupplier(v)}
            />

            {/* QUANTITY */}
            <input
              className="border p-2 rounded"
              placeholder="Quantity (kg)"
              value={qty}
              onChange={e => setQty(e.target.value)}
            />

            {/* RATE */}
            <input
              className="border p-2 rounded"
              placeholder="Rate (₹ / kg)"
              value={rate}
              onChange={e => setRate(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <button
              onClick={editing ? saveEdit : submit}
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading
                ? "Saving..."
                : editing
                ? "Save Changes"
                : "Add Batch"}
            </button>

            {editing && (
              <button
                onClick={() => {
                  setEditing(null)
                  setQty("")
                  setRate("")
                }}
                className="ml-4 text-sm text-gray-600 underline"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* ===============================
            RECENT BATCHES TABLE
        ================================ */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-3">
            Recent Stock Batches
          </h2>

          <DataTable
            columns={[
              { key: "received", label: "Received" },
              { key: "powder", label: "Powder" },
              { key: "supplier", label: "Supplier" },
              { key: "qty_remaining", label: "Qty Remaining" },
              { key: "rate", label: "Rate / kg" },
              {
    key: "actions",
    label: "Actions",
    render: (row: any) => row.actions
  }

            ]}
            data={batches.map(b => ({
              ...b,
              actions: (
                <div className="flex gap-3">
                  <button
                    onClick={() => startEdit(b)}
                    className={`text-sm ${
                      b.editable
                        ? "text-blue-600 hover:underline"
                        : "text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => removeBatch(b)}
                    className={`text-sm ${
                      b.editable
                        ? "text-red-600 hover:underline"
                        : "text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Delete
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
