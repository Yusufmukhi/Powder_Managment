import DataTable from "./DataTable"

interface Props {
  open: boolean
  powder: string | null
  fromDate: string
  toDate: string
  activeTab: "usage" | "stock"
  usageRows: any[]
  stockRows: any[]
  onClose: () => void
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  onTabChange: (v: "usage" | "stock") => void
}

export default function InventoryModal({
  open,
  powder,
  fromDate,
  toDate,
  activeTab,
  usageRows,
  stockRows,
  onClose,
  onFromChange,
  onToChange,
  onTabChange
}: Props) {
  if (!open || !powder) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-[95%] max-w-5xl rounded-lg shadow-lg p-5 max-h-[90vh] overflow-y-auto">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">
            Powder: {powder}
          </h3>
          <button
            className="text-red-600 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* DATE FILTER */}
        <div className="flex gap-4 mb-4">
          <div>
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => onFromChange(e.target.value)}
              className="border p-1 rounded"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => onToChange(e.target.value)}
              className="border p-1 rounded"
            />
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-6 border-b mb-4">
          <button
            onClick={() => onTabChange("usage")}
            className={`pb-2 ${
              activeTab === "usage"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500"
            }`}
          >
            Usage
          </button>

          <button
            onClick={() => onTabChange("stock")}
            className={`pb-2 ${
              activeTab === "stock"
                ? "border-b-2 border-green-600 text-green-600"
                : "text-gray-500"
            }`}
          >
            Add Stock
          </button>
        </div>

        {/* TABLES */}
        {activeTab === "usage" && (
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "supplier", label: "Supplier" },
              { key: "client", label: "Client" },
              { key: "qty", label: "Qty (kg)" },
              { key: "cost", label: "Cost (₹)" }
            ]}
            data={usageRows}
            pageSize={5}
            height="h-64"
          />
        )}

        {activeTab === "stock" && (
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "supplier", label: "Supplier" },
              { key: "qty", label: "Qty (kg)" },
              { key: "rate", label: "Rate (₹)" },
              { key: "value", label: "Value (₹)" }
            ]}
            data={stockRows}
            pageSize={5}
            height="h-64"
          />
        )}
      </div>
    </div>
  )
}
