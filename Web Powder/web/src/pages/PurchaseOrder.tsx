import { useEffect, useState } from "react"
import { useSession } from "../context/useSession"
import DataTable from "../components/DataTable"
import SearchSelect from "../components/SearchSelect"
import { supabase } from "../lib/supabase"

type Option = {
  id: string
  label: string
}

type POItem = {
  powder: Option | null
  qty: string
  rate: string
}

type PO = {
  id: string
  po_number: string
  po_date: string
  supplier_name: string
  total_amount: number
  status: string
}

const API =  "https://powder-managment-1.onrender.com"

export default function PurchaseOrder() {
  const { session } = useSession()

  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [powders, setPowders] = useState<Option[]>([])
  const [supplier, setSupplier] = useState<Option | null>(null)
  const [items, setItems] = useState<POItem[]>([
    { powder: null, qty: "", rate: "" }
  ])
  const [saving, setSaving] = useState(false)
  const [pos, setPos] = useState<PO[]>([])

  /* ---------------- LOAD DATA ---------------- */
  useEffect(() => {
    if (!session.companyId) return
    fetchSuppliers()
    fetchPowders()
    loadPOs()
  }, [session.companyId])

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("id, supplier_name")
      .eq("company_id", session.companyId)
    setSuppliers(data?.map(s => ({ id: s.id, label: s.supplier_name })) ?? [])
  }

  const fetchPowders = async () => {
    const { data } = await supabase
      .from("powders")
      .select("id, powder_name")
      .eq("company_id", session.companyId)
    setPowders(data?.map(p => ({ id: p.id, label: p.powder_name })) ?? [])
  }

  const loadPOs = async () => {
    const res = await fetch(`${API}/po/list`, {
      headers: { "X-Company-Id": session.companyId! }
    })
    const data = await res.json()
    setPos(Array.isArray(data) ? data : [])
  }

  /* ---------------- CREATE PO ---------------- */
  const createPO = async () => {
    if (!supplier) return alert("Supplier required")
    if (items.some(i => !i.powder || !i.qty || !i.rate))
      return alert("Fill all items")

    const total = items.reduce(
      (s, i) => s + Number(i.qty) * Number(i.rate),
      0
    )

    setSaving(true)
    try {
      await fetch(`${API}/po/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Company-Id": session.companyId!
        },
        body: JSON.stringify({
          user_id: session.userId,
          supplier_id: supplier.id,
          supplier_name: supplier.label,
          po_number: `PO-${Date.now()}`,
          po_date: new Date().toISOString().slice(0, 10),
          total_amount: total,
          items: items.map(i => ({
            powder_id: i.powder!.id,
            quantity_kg: Number(i.qty),
            rate_per_kg: Number(i.rate)
          }))
        })
      })

      setSupplier(null)
      setItems([{ powder: null, qty: "", rate: "" }])
      loadPOs()
    } finally {
      setSaving(false)
    }
  }

  /* ---------------- ACTIONS ---------------- */
  const cancelPO = async (id: string) => {
    await fetch(`${API}/po/cancel/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Company-Id": session.companyId!
      },
      body: JSON.stringify({ user_id: session.userId })
    })
    loadPOs()
  }

  const deliverPO = async (id: string) => {
    if (!confirm("Mark as delivered and add stock?")) return
    await fetch(`${API}/po/deliver/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Company-Id": session.companyId!
      },
      body: JSON.stringify({ user_id: session.userId })
    })
    loadPOs()
  }

  const downloadPDF = async (id: string) => {
    const res = await fetch(`${API}/po/pdf/${id}`, {
      headers: { "X-Company-Id": session.companyId! }
    })
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `PO-${id}.pdf`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
  <div className="p-4 sm:p-6 space-y-6 md:space-y-8">
    {/* CREATE PO */}
    <div className="bg-white p-5 sm:p-6 md:p-8 rounded-xl shadow-md max-w-5xl mx-auto border border-gray-100">

      <h2 className="text-xl sm:text-2xl font-bold mb-6 text-gray-800">Create Purchase Order</h2>

      {/* Supplier */}
      <div className="mb-6 md:mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Supplier <span className="text-red-500">*</span>
        </label>
        <SearchSelect
          placeholder="Select supplier..."
          options={suppliers}
          value={supplier}
          onChange={setSupplier}
          className="w-full max-w-lg"
        />
      </div>

      {/* Items - responsive grid */}
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-end bg-gray-50/70 p-4 sm:p-5 rounded-lg border border-gray-200 shadow-sm"
          >
            {/* Powder - takes most space */}
            <div className="sm:col-span-5">
              <label className="block text-sm text-gray-600 mb-1.5">Powder</label>
              <SearchSelect
                placeholder="Select powder..."
                options={powders}
                value={item.powder}
                onChange={(v) => {
                  const newItems = [...items];
                  newItems[idx].powder = v;
                  setItems(newItems);
                }}
              />
            </div>

            {/* Qty */}
            <div className="sm:col-span-2">
              <label className="block text-sm text-gray-600 mb-1.5">Quantity</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition"
                placeholder="Qty"
                value={item.qty}
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[idx].qty = e.target.value;
                  setItems(newItems);
                }}
              />
            </div>

            {/* Rate */}
            <div className="sm:col-span-2">
              <label className="block text-sm text-gray-600 mb-1.5">Rate (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition"
                placeholder="Rate"
                value={item.rate}
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[idx].rate = e.target.value;
                  setItems(newItems);
                }}
              />
            </div>

            {/* Remove - right aligned on desktop, full width button on mobile */}
            <div className="sm:col-span-3 flex sm:justify-end pt-2 sm:pt-0">
              <button
                type="button"
                onClick={() => setItems(items.filter((_, i) => i !== idx))}
                className="w-full sm:w-auto text-red-600 hover:text-red-700 font-medium px-4 py-2.5 rounded-lg hover:bg-red-50 transition border border-red-200 sm:border-none"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setItems([...items, { powder: null, qty: "", rate: "" }])}
        className="mt-5 text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5 hover:underline"
      >
        <span className="text-lg">＋</span> Add Item
      </button>

      {/* Total preview */}
      {items.length > 0 && (
        <div className="mt-6 pt-5 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-sm font-medium text-gray-800">
            <span>Estimated total amount:</span>
            <span className="text-lg font-semibold">
              ₹ {items
                .reduce((sum, i) => {
                  const qty  = Number(i.qty)  || 0;
                  const rate = Number(i.rate) || 0;
                  return sum + qty * rate;
                }, 0)
                .toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <button
        onClick={createPO}
        disabled={!supplier || items.length === 0}
        className={`
          mt-8 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 
          text-white px-7 py-3 rounded-lg font-medium 
          disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed 
          transition shadow-sm hover:shadow
        `}
      >
        Create Purchase Order
      </button>
    </div>

    {/* PO LIST */}
    <div className="bg-white p-5 sm:p-6 rounded-xl shadow-md border border-gray-100 overflow-hidden">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Purchase Orders</h3>

      {/* 
        If your DataTable component supports responsive behavior (horizontal scroll, etc.),
        keep it. Otherwise consider conditional rendering cards on mobile.
      */}
      <div className="overflow-x-auto">
        <DataTable
          columns={[
            { key: "po_number", label: "PO No" },
            { key: "supplier_name", label: "Supplier" },
            { key: "total_amount", label: "Total" },
            { key: "status", label: "Status" },
            {
              key: "actions",
              label: "Actions",
              render: (row: PO) => (
                <div className="flex flex-wrap gap-3">
                  {row.status === "OPEN" && (
                    <>
                      <button 
                        onClick={() => deliverPO(row.id)} 
                        className="text-green-600 hover:text-green-800 font-medium"
                      >
                        Deliver
                      </button>
                      <button 
                        onClick={() => cancelPO(row.id)} 
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {row.status === "COMPLETED" && (
                    <span className="text-green-700 font-semibold">Delivered</span>
                  )}
                  <button 
                    onClick={() => downloadPDF(row.id)}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    PDF
                  </button>
                </div>
              )
            }
          ]}
          data={pos}
          pageSize={6}
          height="h-80 sm:h-96"
        />
      </div>
    </div>
  </div>
);
}
