// components/PowderDetailsModal.tsx
import { useEffect, useState } from "react";
import DataTable from "./DataTable";
import { loadUsageByPowder, loadStockByPowder } from "../services/dashboard";

type Props = {
  powder: string;
  companyId: string;
  onClose: () => void;
};

export default function PowderDetailsModal({ powder, companyId, onClose }: Props) {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });

  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [activeTab, setActiveTab] = useState<"usage" | "stock">("usage");
  const [usageRows, setUsageRows] = useState<any[]>([]);
  const [stockRows, setStockRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || !powder) return;

    let isMounted = true;
    setLoading(true);

    const fetchData = async () => {
      try {
        if (activeTab === "usage") {
          const rows = await loadUsageByPowder(companyId, powder, fromDate, toDate);
          if (isMounted) setUsageRows(rows);
        } else {
          const rows = await loadStockByPowder(companyId, powder, fromDate, toDate);
          if (isMounted) setStockRows(rows);
        }
      } catch (err) {
        console.error("Modal data fetch error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [companyId, powder, fromDate, toDate, activeTab]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">Powder: {powder}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {/* Date range */}
        <div className="px-6 py-4 flex flex-wrap gap-4 items-end bg-gray-50">
          <div>
            <label className="block text-sm text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 bg-white">
          <button
            onClick={() => setActiveTab("usage")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "usage"
                ? "border-b-3 border-blue-600 text-blue-700"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Usage
          </button>
          <button
            onClick={() => setActiveTab("stock")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "stock"
                ? "border-b-3 border-green-600 text-green-700"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Stock Entries
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading data...</div>
          ) : activeTab === "usage" ? (
            usageRows.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No usage records found in selected date range.
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "date", label: "Date" },
                  { key: "supplier", label: "Supplier" },
                  { key: "client", label: "Client" },
                  { key: "qty", label: "Qty (kg)" },
                  { key: "cost", label: "Cost (₹)" },
                ]}
                data={usageRows}
                pageSize={8}
                height="h-[420px]"
              />
            )
          ) : stockRows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No stock entries found in selected date range.
            </div>
          ) : (
            <DataTable
              columns={[
                { key: "date", label: "Date" },
                { key: "supplier", label: "Supplier" },
                { key: "qty", label: "Qty (kg)" },
                { key: "rate", label: "Rate (₹/kg)" },
                { key: "value", label: "Value (₹)" },
              ]}
              data={stockRows}
              pageSize={8}
              height="h-[420px]"
            />
          )}
        </div>
      </div>
    </div>
  );
}