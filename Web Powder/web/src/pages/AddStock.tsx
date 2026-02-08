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

  /* ---------- master ---------- */
  const [powders, setPowders] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Option[]>([])

  /* ---------- form ---------- */
  const [powder, setPowder] = useState<Option | null>(null)
  const [supplier, setSupplier] = useState<Option | null>(null)
  const [qty, setQty] = useState("")
  const [rate, setRate] = useState("")
  const [saving, setSaving] = useState(false)

  /* ---------- edit ---------- */
  const [editingId, setEditingId] = useState<string | null>(null)

  /* ---------- table ---------- */
  const [batches, setBatches] = useState<BatchRow[]>([])

  /* ======================================================
     LOAD MASTER + DATA
  ====================================================== */
  useEffect(() => {
    if (!session.companyId) return
    refreshAll()
  }, [session.companyId])

  const refreshAll = async () => {
    const [p, s, b] = await Promise.all([
      loadPowders(session.companyId!),
      loadSuppliers(session.companyId!),
      loadRecentBatches(session.companyId!)
    ])

    setPowders(p.map(x => ({ id: x.id, label: x.powder_name })))
    setSuppliers(s.map(x => ({ id: x.id, label: x.supplier_name })))
    setBatches(b)
  }

  /* ======================================================
     ADD / UPDATE STOCK
  ====================================================== */
  const saveStock = async () => {
    if (!powder || !supplier || !qty || !rate) {
      alert("All fields required")
      return
    }

    const q = Number(qty)
    const r = Number(rate)

    if (q <= 0 || r <= 0) {
      alert("Invalid qty or rate")
      return
    }

    setSaving(true)

    try {
      if (editingId) {
        // 🔐 update allowed only when remaining == received
        await updateStockBatch({
          batchId: editingId,
          qty: q,
          rate: r,
          supplierId: supplier.id
        })
      } else {
        await addStockBatch({
          companyId: session.companyId!,
          powderId: powder.id,
          supplierId: supplier.id,
          qty: q,
          rate: r,
          userId: session.userId!
        })
      }

      resetForm()
      refreshAll()
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setPowder(null)
    setSupplier(null)
    setQty("")
    setRate("")
    setEditingId(null)
  }

  /* ======================================================
     EDIT
  ====================================================== */
  const startEdit = (row: BatchRow) => {
    if (!row.editable) {
      alert("Cannot edit: stock already used")
      return
    }

    setEditingId(row.id)
    setQty(String(row.qty_received))
    setRate(String(row.rate))

    const p = powders.find(x => x.label === row.powder)
    const s = suppliers.find(x => x.label === row.supplier)

    if (p) setPowder(p)
    if (s) setSupplier(s)
  }

  /* ======================================================
     DELETE
  ====================================================== */
  const removeBatch = async (id: string) => {
    if (!confirm("Delete this batch?")) return
    await deleteStockBatch(id)
    refreshAll()
  }

  /* ======================================================
     UI
  ====================================================== */
  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ================= FORM ================= */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-4">
          {editingId ? "Edit Stock Batch" : "Add Stock"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SearchSelect
            placeholder="Powder"
            options={powders}
            value={powder}
            onChange={setPowder}
          />

          {/* ✅ supplier CAN be edited */}
          <SearchSelect
            placeholder="Supplier"
            options={suppliers}
            value={supplier}
            onChange={setSupplier}
          />

          <input
            className="border p-2 rounded"
            placeholder="Qty (kg)"
            value={qty}
            onChange={e => setQty(e.target.value)}
          />

          <input
            className="border p-2 rounded"
            placeholder="Rate"
            value={rate}
            onChange={e => setRate(e.target.value)}
          />
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={saveStock}
            disabled={saving}
            className="bg-blue-600 text-white px-5 py-2 rounded"
          >
            {saving ? "Saving..." : editingId ? "Update Stock" : "Add Stock"}
          </button>

          {editingId && (
            <button
              onClick={resetForm}
              className="text-gray-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-3">Stock Batches</h2>

        <DataTable
          columns={[
            { key: "received", label: "Date" },
            { key: "powder", label: "Powder" },
            { key: "supplier", label: "Supplier" },
            { key: "qty_received", label: "Received" },
            { key: "qty_remaining", label: "Remaining" },
            { key: "rate", label: "Rate" },
            {
              key: "actions",
              label: "Actions",
              render: (row: BatchRow) => (
                <div className="flex gap-3">
                  {row.editable && (
                    <button
                      onClick={() => startEdit(row)}
                      className="text-blue-600 text-sm"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => removeBatch(row.id)}
                    className="text-red-600 text-sm"
                  >
                    Delete
                  </button>
                </div>
              )
            }
          ]}
          data={batches.map(b => ({ ...b, actions: "" }))}
          pageSize={6}
          height="h-80"
        />
      </div>
    </div>
  )
}
