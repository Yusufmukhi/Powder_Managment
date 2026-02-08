import { useEffect, useState } from "react"
import { useSession } from "../context/useSession"
import { supabase } from "../lib/supabase"

type KPI = {
  label: string
  value: string
}

const API_BASE = "http://localhost:8000"

export default function Analysis() {
  const { session } = useSession()

  const [kpis, setKpis] = useState<KPI[]>([])
  const [loading, setLoading] = useState(false)

  // Month picker (YYYY-MM)
  const [month, setMonth] = useState(
    new Date().toISOString().slice(0, 7)
  )

  // Financial year start (YYYY)
  const [fyYear, setFyYear] = useState(
    new Date().getFullYear().toString()
  )

  // --------------------------------
  // LOAD KPI DATA
  // --------------------------------
  const loadKPIs = async () => {
    if (!session?.companyId) return

    setLoading(true)

    const [y, m] = month.split("-").map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59)

    const [{ data: stock }, { data: usage }] = await Promise.all([
      supabase
        .from("stock_batches")
        .select("qty_remaining")
        .eq("company_id", session.companyId),

      supabase
        .from("usage")
        .select("quantity_kg, total_cost")
        .eq("company_id", session.companyId)
        .gte("used_at", start.toISOString())
        .lte("used_at", end.toISOString())
    ])

    const totalStock =
      stock?.reduce((s, r) => s + Number(r.qty_remaining), 0) || 0

    const totalUsage =
      usage?.reduce((s, r) => s + Number(r.quantity_kg), 0) || 0

    const totalCost =
      usage?.reduce((s, r) => s + Number(r.total_cost), 0) || 0

    const avgCost =
      totalUsage > 0 ? totalCost / totalUsage : 0

    setKpis([
      { label: "Total Stock (kg)", value: totalStock.toFixed(2) },
      { label: "Total Usage (kg)", value: totalUsage.toFixed(2) },
      { label: "Total Cost (₹)", value: totalCost.toFixed(2) },
      {
        label: "Average Cost / kg (₹)",
        value: avgCost.toFixed(2)
      }
    ])

    setLoading(false)
  }

  useEffect(() => {
    loadKPIs()
  }, [month, session?.companyId])

  // --------------------------------
  // MONTHLY PDF (BACKEND)
  // --------------------------------
  const downloadMonthly = async () => {
  const [y, m] = month.split("-")

  const res = await fetch(
    `${API_BASE}/reports/monthly?year=${y}&month=${Number(m)}`,
    {
      headers: {
        "X-Company-Id": session.companyId!
      }
    }
  )

  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = `Monthly_Report_${y}_${m}.pdf`
  a.click()

  window.URL.revokeObjectURL(url)
}


  // --------------------------------
  // ANNUAL PDF (BACKEND)
  // --------------------------------
  const downloadAnnual = async () => {
  const res = await fetch(
    `${API_BASE}/reports/annual?year=${fyYear}`,
    {
      headers: {
        "X-Company-Id": session.companyId!
      }
    }
  )

  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = `Annual_Audit_Report_${fyYear}.pdf`
  a.click()

  window.URL.revokeObjectURL(url)
}


  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* CONTROLS */}
      <div className="bg-white p-4 rounded shadow space-y-6">
        {/* MONTHLY */}
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div>
            <label className="text-sm text-gray-600">
              Monthly Report
            </label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          <button
            onClick={downloadMonthly}
            className="bg-blue-600 text-white px-5 py-2 rounded"
          >
            Download Monthly PDF
          </button>
        </div>

        {/* ANNUAL */}
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div>
            <label className="text-sm text-gray-600">
              Annual Audit Report
            </label>
            <select
              value={fyYear}
              onChange={e => setFyYear(e.target.value)}
              className="border p-2 rounded w-full"
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const y = new Date().getFullYear() - i
                return (
                  <option key={y} value={y}>
                    FY {y}-{String(y + 1).slice(-2)}
                  </option>
                )
              })}
            </select>
          </div>

          <button
            onClick={downloadAnnual}
            className="bg-green-600 text-white px-5 py-2 rounded"
          >
            Download Annual PDF
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white p-4 rounded shadow">
            <div className="text-xs text-gray-500 uppercase">
              {k.label}
            </div>
            <div className="text-xl font-semibold">
              {k.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
