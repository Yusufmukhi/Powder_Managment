import DataTable from "./DataTable"

export default function PowderDetailsModal({
  powder,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  activeTab,
  setActiveTab,
  usageRows,
  stockRows,
  onClose
}: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-[900px] rounded shadow-lg p-5">

        {/* HEADER */}
        <div className="flex justify-between mb-3">
          <h2 className="font-semibold text-lg">
            Powder Details – {powder}
          </h2>
          <button onClick={onClose} className="text-red-600 text-sm">
            Close
          </button>
        </div>

        {/* DATE FILTER */}
        <div className="flex gap-4 mb-4">
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border p-1 rounded"
          />
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border p-1 rounded"
          />
        </div>

        {/* TABS */}
        <div className="flex gap-6 border-b mb-4">
          <button
            onClick={() => setActiveTab("usage")}
            className={activeTab === "usage" ? "border-b-2 border-blue-600 text-blue-600" : ""}
          >
            Usage
          </button>
          <button
            onClick={() => setActiveTab("stock")}
            className={activeTab === "stock" ? "border-b-2 border-green-600 text-green-600" : ""}
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
            pageSize={6}
            height="h-72"
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
            pageSize={6}
            height="h-72"
          />
        )}
      </div>
    </div>
  )
}
