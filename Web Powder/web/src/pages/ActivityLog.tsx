import { useEffect, useState } from "react"
import { useSession } from "../context/useSession"
import DataTable from "../components/DataTable"
import { supabase } from "../lib/supabase"

type LogRow = {
  date: string
  user: string
  event: string
  module: string
  details: string
}

export default function ActivityLog() {
  const { session } = useSession()

  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(false)

  /* ---------------- DEFAULT RANGE: last 7 days ---------------- */
  useEffect(() => {
    const to = new Date()
    const from = new Date()
    from.setDate(to.getDate() - 7)

    setFromDate(from.toISOString().slice(0, 10))
    setToDate(to.toISOString().slice(0, 10))
  }, [])

  /* ---------------- LOAD DATA ---------------- */
  useEffect(() => {
    if (!session?.companyId || !fromDate || !toDate) return
    loadActivity()
  }, [session?.companyId, fromDate, toDate])

  const loadActivity = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from("activity_log")
      .select(`
        created_at,
        event_type,
        ref_type,
        meta,
        user:users (full_name, username)
      `)
      .eq("company_id", session.companyId)
      .gte("created_at", `${fromDate}T00:00:00`)
      .lte("created_at", `${toDate}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) {
      console.error("Failed to load activity log:", error.message)
      setRows([])
      setLoading(false)
      return
    }

    setRows(
      (data || []).map((r: any) => ({
        date: new Date(r.created_at).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }),
        user: r.user?.full_name || r.user?.username || "—",
        event: r.event_type,
        module: r.ref_type,
        details: r.meta ? JSON.stringify(r.meta) : "—"
      }))
    )
    setLoading(false)
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h2 className="text-xl font-semibold">Activity Log</h2>

      {/* DATE FILTER */}
      <div className="flex gap-4 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border p-1 rounded"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border p-1 rounded"
          />
        </div>
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : (
        <DataTable
          columns={[
            { key: "date", label: "Date & Time" },
            { key: "user", label: "User" },
            { key: "event", label: "Event" },
            { key: "module", label: "Module" },
            { key: "details", label: "Details" }
          ]}
          data={rows}
          pageSize={15}
          height="h-[28rem]"
        />
      )}
    </div>
  )
}
