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
  meta: string
}

/* ---------------- JSON -> READABLE TEXT ---------------- */

// Columns we never want to show even in readable form (noise, already shown elsewhere)
const SKIP_KEYS = new Set([
  "id",
  "company_id",
  "created_at",
  "created_by",
  "updated_by",
  "user_id",
  "timestamp"
])

// Nicer labels for common field names
const LABELS: Record<string, string> = {
  full_name: "Name",
  qty_remaining: "Qty Remaining",
  qty_received: "Qty Received",
  qty_used: "Qty Used",
  rate_per_kg: "Rate/kg",
  total_amount: "Total Amount",
  po_number: "PO Number",
  supplier_name: "Supplier",
  supplier: "Supplier",
  client_name: "Client",
  client: "Client",
  powder_name: "Powder",
  powder: "Powder",
  status: "Status",
  reason: "Reason",
  note: "Note",
  table: "Table",
  action: "Action"
}

function humanizeKey(key: string): string {
  if (LABELS[key]) return LABELS[key]
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "number") return v.toLocaleString("en-IN")
  return String(v)
}

// Turns { qty_remaining: 150, reason: "..." } into "Qty Remaining: 150 · Reason: ..."
function formatObject(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "—"
  const entries = Object.entries(obj as Record<string, unknown>).filter(
    ([k]) => !SKIP_KEYS.has(k)
  )
  if (entries.length === 0) return "—"
  return entries
    .map(([k, v]) => `${humanizeKey(k)}: ${formatValue(v)}`)
    .join(" · ")
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
        "id, created_at, user_id, event_type, ref_type, ref_id, old_values, new_values, meta"
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
        old_values: formatObject(r.old_values),
        new_values: formatObject(r.new_values),
        meta: formatObject(r.meta)
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
