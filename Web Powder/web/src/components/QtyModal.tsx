import React, { useEffect, useState } from "react";
import AddStock from "../pages/AddStock";
import Usage from "../pages/Usage";
import DataTable from "./DataTable";
import { getRecentActivities } from "../services/dashboard";

interface Props {
  open: boolean;
  onClose: () => void;
}

const QtyModal: React.FC<Props> = ({ open, onClose }) => {
  const [tab, setTab] = useState<"usage" | "stock">("usage");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    loadActivities();
  }, [from, to, open]);

  const loadActivities = async () => {
    const data = await getRecentActivities(from, to);
    setActivities(data);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
      <div className="bg-white w-[90%] max-w-5xl rounded-lg p-6 relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500"
        >
          ✕
        </button>

        <h2 className="text-xl font-semibold mb-4">Stock & Usage</h2>

        {/* Date Filters */}
        <div className="flex gap-4 mb-4">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setTab("usage")}
            className={`px-3 py-1 rounded ${
              tab === "usage" ? "bg-blue-600 text-white" : "bg-gray-100"
            }`}
          >
            Usage
          </button>
          <button
            onClick={() => setTab("stock")}
            className={`px-3 py-1 rounded ${
              tab === "stock" ? "bg-blue-600 text-white" : "bg-gray-100"
            }`}
          >
            Add Stock
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          {tab === "usage" ? <Usage /> : <AddStock />}
        </div>

        {/* Recent Activity */}
        <h3 className="font-semibold mb-2">Recent Activities</h3>
        <DataTable
          columns={[
            { key: "date", label: "Date" },
            { key: "event", label: "Event" },
            { key: "description", label: "Description" },
          ]}
          data={activities}
        />
      </div>
    </div>
  );
};

export default QtyModal;
