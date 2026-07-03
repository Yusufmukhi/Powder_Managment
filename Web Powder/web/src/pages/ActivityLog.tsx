import { useEffect, useState } from "react"
import { useSession } from "../context/useSession"
import DataTable from "../components/DataTable"
import { supabase } from "../lib/supabase"

type RawRow = {
  id: string
  date: string
  user: string
  event: string
  module: string
  ref_id: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  meta: Record<string, unknown> | null
}

/* ============================================================
   FIELD FORMATTING
   ============================================================ */

// Fields we never show, anywhere (internal FK / audit noise).
const SKIP_KEYS = new Set([
  "id",
  "company_id",
  "created_at",
  "created_by",
  "updated_by",
  "user_id",
  "timestamp",
  "client_id",
  "powder_id",
  "supplier_id"
])

// Fields that carry a currency value.
const CURRENCY_KEYS = new Set(["rate/kg", "rate_per_kg", "total_cost", "total_amount"])

// Nicer labels for common field names.
const LABELS: Record<string, string> = {
  full_name: "Name",
  qty_remaining: "Qty Remaining",
  qty_received: "Qty Received",
  qty_used: "Qty Used",
  quantity_kg: "Quantity (kg)",
  rate_per_kg: "Rate / kg",
  total_amount: "Total Amount",
  total_cost: "Total Cost",
  total_qty: "Total Qty",
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
  used_at: "Used At",
  received_at: "Received At",
  approved_by: "Approved By"
}

function humanizeKey(key: string): string {
  if (LABELS[key]) return LABELS[key]
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (key === "used_at" || key === "received_at") {
    const d = new Date(String(v))
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    }
  }
  if (typeof v === "number") {
    const formatted = v.toLocaleString("en-IN")
    return CURRENCY_KEYS.has(key) ? `₹${formatted}` : formatted
  }
  return String(v)
}

type FieldDiff = {
  key: string
  label: string
  before: string
  after: string
  changed: boolean
}

// Compares old_values vs new_values and returns only the fields worth showing.
function diffValues(
  oldObj: Record<string, unknown> | null,
  newObj: Record<string, unknown> | null
): FieldDiff[] {
  const keys = new Set([
    ...Object.keys(oldObj || {}),
    ...Object.keys(newObj || {})
  ])

  const diffs: FieldDiff[] = []

  keys.forEach(key => {
    if (SKIP_KEYS.has(key)) return

    const before = oldObj ? formatValue(key, oldObj[key]) : "—"
    const after = newObj ? formatValue(key, newObj[key]) : "—"
    const changed = before !== after

    // For CREATE (no old row) / DELETE (no new row) show every populated field.
    // For UPDATE, only show fields that actually changed.
    const isPureCreate = !oldObj && !!newObj
    const isPureDelete = !!oldObj && !newObj

    if (isPureCreate && after === "—") return
    if (isPureDelete && before === "—") return
    if (!isPureCreate && !isPureDelete && !changed) return

    diffs.push({ key, label: humanizeKey(key), before, after, changed })
  })

  return diffs
}

/* ============================================================
   EVENT BADGE
   ============================================================ */

const EVENT_STYLES: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INSERT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
  DELETE: "bg-red-50 text-red-700 border-red-200",
  APPROVE: "bg-violet-50 text-violet-700 border-violet-200",
  MANUAL_ADJUST: "bg-amber-50 text-amber-700 border-amber-200",
  FIFO_APPLY: "bg-teal-50 text-teal-700 border-teal-200"
}

function EventBadge({ event }: { event: string }) {
  const style = EVENT_STYLES[event] || "bg-gray-50 text-gray-700 border-gray-200"
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}
    >
      {event.replace(/_/g, " ")}
    </span>
  )
}

function ModulePill({ module }: { module: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-medium">
      {module.replace(/_/g, " ")}
    </span>
  )
}

function ShortId({ id }: { id: string }) {
  if (!id || id === "—") return <span className="text-gray-400">—</span>
  const short = id.length > 8 ? `${id.slice(0, 8)}…` : id
  return (
    <span
      title={id}
      className="font-mono text-xs text-gray-500 cursor-help"
    >
      {short}
    </span>
  )
}

/* ============================================================
   CHANGES CELL (diff chips + expandable full detail)
   ============================================================ */

function ChangesCell({ row }: { row: RawRow }) {
  const [expanded, setExpanded] = useState(false)
  const diffs = diffValues(row.old_values, row.new_values)
  const note =
    (row.meta && (row.meta["note"] || row.meta["reason"])) || null

  const visible = expanded ? diffs : diffs.slice(0, 3)
  const hiddenCount = diffs.length - visible.length

  if (diffs.length === 0 && !note) {
    return <span className="text-gray-400 text-xs">No field changes</span>
  }

  return (
    <div className="space-y-1 max-w-md">
      {visible.map(d => (
        <div key={d.key} className="text-xs leading-snug">
          <span className="font-medium text-gray-600">{d.label}:</span>{" "}
          {d.before !== "—" && (
            <>
              <span className="line-through text-gray-400">{d.before}</span>{" "}
              <span className="text-gray-400">→</span>{" "}
            </>
          )}
          <span
            className={
              d.changed ? "text-gray-900 font-medium" : "text-gray-700"
            }
          >
            {d.after !== "—" ? d.after : d.before}
          </span>
        </div>
      ))}

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-blue-600 hover:underline"
        >
          +{hiddenCount} more field{hiddenCount > 1 ? "s" : ""}
        </button>
      )}
      {expanded && diffs.length > 3 && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-blue-600 hover:underline block"
        >
          Show less
        </button>
      )}

      {note && (
        <div className="text-xs text-gray-500 italic mt-1">
          "{String(note)}"
        </div>
      )}
    </div>
  )
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

export default function ActivityLog() {
  const { session } = useSession()

  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [rows, setRows] = useState<RawRow[]>([])
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

    // Manually resolve user names for whatever user_ids appear in the results.
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
        id: r.id,
        date: new Date(r.created_at).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }),
        user: r.user_id ? usersById[r.user_id] || "System" : "System",
        event: r.event_type,
        module: r.ref_type,
        ref_id: r.ref_id || "—",
        old_values: r.old_values || null,
        new_values: r.new_values || null,
        meta: r.meta || null
      }))
    )
    setLoading(false)
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Activity Log</h2>
        <p className="text-sm text-gray-500">
          Full audit trail of every create, update, and adjustment across the
          system. Only changed fields are shown by default.
        </p>
      </div>

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
              {
                key: "event",
                label: "Event",
                render: row => <EventBadge event={row.event} />
              },
              {
                key: "module",
                label: "Module",
                render: row => <ModulePill module={row.module} />
              },
              {
                key: "ref_id",
                label: "Ref ID",
                render: row => <ShortId id={row.ref_id} />
              },
              {
                key: "changes",
                label: "Changes",
                render: row => <ChangesCell row={row} />
              }
            ]}
            data={rows}
            pageSize={15}
            height="h-[32rem]"
          />
        </div>
      )}
    </div>
  )
}
