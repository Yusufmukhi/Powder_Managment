import { useEffect, useState } from "react"
import { useSession } from "../context/useSession"
import StatCard from "../components/StatCard"
import DataTable from "../components/DataTable"
import InventoryModal from "../components/InventoryModal"

import {
  loadKpis,
  loadInventoryGrouped as loadInventory,
  loadRecentActivity,
  loadUsageByPowder,
  loadStockByPowder
} from "../services/dashboard"

export default function Dashboard() {
  const { session } = useSession()

  /* ---------------- KPI ---------------- */
  const [kpis, setKpis] = useState({
    totalStock: 0,
    totalValue: 0,
    usedThisMonth: 0
  })

  /* ---------------- BASE DATA ---------------- */
  const [inventory, setInventory] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])

  /* ---------------- MODAL STATE ---------------- */
  const [selectedPowder, setSelectedPowder] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [activeTab, setActiveTab] = useState<"usage" | "stock">("usage")

  const [usageRows, setUsageRows] = useState<any[]>([])
  const [stockRows, setStockRows] = useState<any[]>([])

  /* ---------------- INITIAL LOAD ---------------- */
  useEffect(() => {
    if (!session.companyId) return

    loadKpis(session.companyId).then(setKpis)
    loadInventory(session.companyId).then(setInventory)
    loadRecentActivity(session.companyId).then(setActivity)
  }, [session.companyId])

  /* ---------------- OPEN MODAL DEFAULT LOAD ---------------- */
  useEffect(() => {
    if (!selectedPowder || !session.companyId) return

    const to = new Date()
    const from = new Date()
    from.setDate(to.getDate() - 30)

    const fromStr = from.toISOString().slice(0, 10)
    const toStr = to.toISOString().slice(0, 10)

    setFromDate(fromStr)
    setToDate(toStr)
    setActiveTab("usage")

    loadUsageByPowder(
      session.companyId,
      selectedPowder,
      fromStr,
      toStr
    ).then(setUsageRows)
  }, [selectedPowder])

  /* ---------------- TAB CHANGE ---------------- */
  useEffect(() => {
    if (!selectedPowder || !session.companyId) return

    if (activeTab === "usage") {
      loadUsageByPowder(
        session.companyId,
        selectedPowder,
        fromDate,
        toDate
      ).then(setUsageRows)
    } else {
      loadStockByPowder(
        session.companyId,
        selectedPowder,
        fromDate,
        toDate
      ).then(setStockRows)
    }
  }, [activeTab])

  /* ---------------- DATE CHANGE ---------------- */
  useEffect(() => {
    if (!selectedPowder || !session.companyId) return

    if (activeTab === "usage") {
      loadUsageByPowder(
        session.companyId,
        selectedPowder,
        fromDate,
        toDate
      ).then(setUsageRows)
    } else {
      loadStockByPowder(
        session.companyId,
        selectedPowder,
        fromDate,
        toDate
      ).then(setStockRows)
    }
  }, [fromDate, toDate])

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ================= KPI BAR ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Current Stock (kg)"
          value={kpis.totalStock.toFixed(1)}
        />
        <StatCard
          title="Used This Month (kg)"
          value={kpis.usedThisMonth.toFixed(1)}
        />
        {session.role === "owner" && (
          <StatCard
            title="Stock Value (₹)"
            value={kpis.totalValue.toFixed(2)}
          />
        )}
      </div>

      {/* ================= MAIN GRID ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* INVENTORY */}
        <div className="lg:col-span-2 bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-3">Inventory Status</h2>

          <DataTable
            columns={[
              { key: "powder", label: "Powder" },
              {
                key: "qty",
                label: "Qty (kg)",
                render: (row: any) => (
                  <span
                    className="text-blue-600 underline cursor-pointer"
                    onClick={() => setSelectedPowder(row.powder)}
                  >
                    {row.qty}
                  </span>
                )
              },
              { key: "value", label: "Value (₹)" }
            ]}
            data={inventory}
            pageSize={6}
            height="h-72"
          />
        </div>

        {/* ACTIVITY */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-3">Recent Activity</h2>

          <DataTable
            columns={[
              { key: "time", label: "Time" },
              { key: "event", label: "Event" },
              { key: "module", label: "Module" }
            ]}
            data={activity}
            pageSize={5}
            height="h-72"
          />
        </div>
      </div>

      {/* ================= MODAL ================= */}
      <InventoryModal
        open={!!selectedPowder}
        powder={selectedPowder}
        fromDate={fromDate}
        toDate={toDate}
        activeTab={activeTab}
        usageRows={usageRows}
        stockRows={stockRows}
        onClose={() => setSelectedPowder(null)}
        onFromChange={setFromDate}
        onToChange={setToDate}
        onTabChange={setActiveTab}
      />
    </div>
  )
}
