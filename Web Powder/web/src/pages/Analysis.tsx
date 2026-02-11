import { useEffect, useState } from "react"
import { useSession } from "../context/useSession"
import { supabase } from "../lib/supabase"

type KPI = {
  label: string
  value: string
}

const API_BASE = "https://powder-managment-1.onrender.com"

export default function Analysis() {
  const { session } = useSession()

  const [kpis, setKpis] = useState<KPI[]>([])
  const [loadingKpis, setLoadingKpis] = useState(false)

  // Month picker (YYYY-MM)
  const [month, setMonth] = useState(
    new Date().toISOString().slice(0, 7)
  )

  // Financial year start (YYYY)
  const [fyYear, setFyYear] = useState(
    new Date().getFullYear().toString()
  )

  // Download states
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [annualLoading, setAnnualLoading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // --------------------------------
  // LOAD KPI DATA
  // --------------------------------
  const loadKPIs = async () => {
    if (!session?.companyId) return

    setLoadingKpis(true)

    try {
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
        stock?.reduce((s, r) => s + Number(r.qty_remaining || 0), 0) || 0

      const totalUsage =
        usage?.reduce((s, r) => s + Number(r.quantity_kg || 0), 0) || 0

      const totalCost =
        usage?.reduce((s, r) => s + Number(r.total_cost || 0), 0) || 0

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
    } catch (err) {
      console.error("KPI load error:", err)
      // Optional: show message to user
    } finally {
      setLoadingKpis(false)
    }
  }

  useEffect(() => {
    loadKPIs()
  }, [month, session?.companyId])

  // --------------------------------
  // MONTHLY PDF (with error handling)
  // --------------------------------
  const downloadMonthly = async () => {
    setDownloadError(null)
    setMonthlyLoading(true)

    try {
      const [y, m] = month.split("-")

      const res = await fetch(
        `${API_BASE}/reports/monthly?year=${y}&month=${Number(m)}`,
        {
          headers: {
            "X-Company-Id": session?.companyId || ""
          }
        }
      )

      if (!res.ok) {
        if (res.status === 0) {
          throw new Error("Server is not responding. Please try again later.")
        }
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || "Failed to generate monthly report")
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = url
      a.download = `Monthly_Report_${y}_${m}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error("Monthly PDF error:", err)
      setDownloadError(
        err.message.includes("not responding")
          ? "Server is taking too long to respond. Please try again in a minute."
          : err.message || "Failed to download monthly PDF. Please try again."
      )
    } finally {
      setMonthlyLoading(false)
    }
  }

  // --------------------------------
  // ANNUAL PDF (with error handling)
  // --------------------------------
  const downloadAnnual = async () => {
    setDownloadError(null)
    setAnnualLoading(true)

    try {
      const res = await fetch(
        `${API_BASE}/reports/annual?year=${fyYear}`,
        {
          headers: {
            "X-Company-Id": session?.companyId || ""
          }
        }
      )

      if (!res.ok) {
        if (res.status === 0) {
          throw new Error("Server is not responding. Please try again later.")
        }
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || "Failed to generate annual report")
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = url
      a.download = `Annual_Audit_Report_${fyYear}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error("Annual PDF error:", err)
      setDownloadError(
        err.message.includes("not responding")
          ? "Server is taking too long to respond. Please try again in a minute."
          : err.message || "Failed to download annual PDF. Please try again."
      )
    } finally {
      setAnnualLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* CONTROLS */}
      <div className="bg-white p-4 rounded shadow space-y-6">
        {/* MONTHLY */}
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm text-gray-600 block mb-1">
              Monthly Report
            </label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border p-2 rounded w-full"
              disabled={monthlyLoading}
            />
          </div>

          <button
            onClick={downloadMonthly}
            disabled={monthlyLoading || !session?.companyId}
            className={`
              bg-blue-600 text-white px-5 py-2 rounded min-w-[160px]
              disabled:bg-gray-400 disabled:cursor-not-allowed
              flex items-center justify-center gap-2
            `}
          >
            {monthlyLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Generating...
              </>
            ) : (
              "Download Monthly PDF"
            )}
          </button>
        </div>

        {/* ANNUAL */}
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm text-gray-600 block mb-1">
              Annual Audit Report
            </label>
            <select
              value={fyYear}
              onChange={e => setFyYear(e.target.value)}
              className="border p-2 rounded w-full"
              disabled={annualLoading}
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
            disabled={annualLoading || !session?.companyId}
            className={`
              bg-green-600 text-white px-5 py-2 rounded min-w-[160px]
              disabled:bg-gray-400 disabled:cursor-not-allowed
              flex items-center justify-center gap-2
            `}
          >
            {annualLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Generating...
              </>
            ) : (
              "Download Annual PDF"
            )}
          </button>
        </div>

        {/* Error message for downloads */}
        {downloadError && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r">
            {downloadError}
            <button
              onClick={() => setDownloadError(null)}
              className="ml-3 text-sm underline hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* KPI CARDS */}
      {loadingKpis ? (
        <div className="text-center py-10 text-gray-500">Loading KPIs...</div>
      ) : (
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
      )}
    </div>
  )
}