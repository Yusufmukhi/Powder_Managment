import { useEffect, useState } from "react"
import { useSession } from "../context/useSession"
import DataTable from "../components/DataTable"
import { supabase } from "../lib/supabase"

type LogRow = {
  date: string
  user: string
  event: string
  module: string
  ref_id: string
  old_values: string
  new_values: string
  changed_fields: string
  ip_address: string
  user_agent: string
  meta: string
}

export default function ActivityLog() {
  const { session } = useSession()

  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

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
    setLoadError(null)

    // Pull every column the activity_log table has.
    // NOTE: user_id -> users is joined manually below (not via embed)
    // so this works even before the FK relationship is added in Supabase.
    const { data: logs, error } = await supabase
      .from("activity_log")
      .select(
        "id, created_at, user_id, event_type, ref_type, ref_id, old_values, new_values, changed_fields, ip_address, user_agent, meta"
      )
      .eq("company_id", session.companyId)
      .gte("created_at", `${fromDate}T00:00:00`)
      .lte("created_at", `${toDate}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) {
      console.error("Failed to load activity log:", error.message)
      setLoadError(error.message)
      setRows([])
      setLoading(false)
      return
    }

    // Manually fetch user names for whatever user_ids appear in the results
    const userIds = Array.from(
      new Set((logs || []).map((r: any) => r.user_id).filter(Boolean))
    )

    let usersById: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, username")
        .in("id", userIds)

      usersById = Object.fromEntries(
        (users || []).map((u: any) => [u.id, u.full_name || u.username])
      )
    }

    setRows(
      (logs || []).map((r: any) => ({
        date: new Date(r.created_at).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }),
        user: r.user_id ? usersById[r.user_id] || r.user_id : "—",
        event: r.event_type,
        module: r.ref_type,
        ref_id: r.ref_id || "—",
        old_values: r.old_values ? JSON.stringify(r.old_values) : "—",
        new_values: r.new_values ? JSON.stringify(r.new_values) : "—",
        changed_fields: r.changed_fields ? r.changed_fields.join(", ") : "—",
        ip_address: r.ip_address || "—",
        user_agent: r.user_agent || "—",
        meta: r.meta ? JSON.stringify(r.meta) : "—"
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

      {loadError && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">
          {loadError}
        </div>
      )}

      {/* TABLE */}
      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={[
              { key: "date", label: "Date & Time" },
              { key: "user", label: "User" },
              { key: "event", label: "Event" },
              { key: "module", label: "Module" },
              { key: "ref_id", label: "Ref ID" },
              { key: "old_values", label: "Old Values" },
              { key: "new_values", label: "New Values" },
              { key: "changed_fields", label: "Changed Fields" },
              { key: "ip_address", label: "IP Address" },
              { key: "user_agent", label: "User Agent" },
              { key: "meta", label: "Meta" }
            ]}
            data={rows}
            pageSize={15}
            height="h-[28rem]"
          />
        </div>
      )}
    </div>
  )
}
