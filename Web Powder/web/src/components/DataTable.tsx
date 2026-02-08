import { useMemo, useState, ReactNode } from "react"

type Column<T> = {
  key: keyof T
  label: string
  render?: (row: T) => ReactNode
}

type Props<T> = {
  columns: Column<T>[]
  data: T[]
  pageSize?: number
  height?: string
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  pageSize = 5,
  height = "h-64"
}: Props<T>) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<keyof T | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [filters, setFilters] = useState<Record<string, string>>({})

  /* ---------- NUMBER FILTER ---------- */
  const matchNumberFilter = (value: number, filter: string) => {
    const f = filter.replace(/\s+/g, "")

    if (/^>=\d+(\.\d+)?$/.test(f)) return value >= Number(f.slice(2))
    if (/^<=\d+(\.\d+)?$/.test(f)) return value <= Number(f.slice(2))
    if (/^>\d+(\.\d+)?$/.test(f)) return value > Number(f.slice(1))
    if (/^<\d+(\.\d+)?$/.test(f)) return value < Number(f.slice(1))

    if (/^\d+(\.\d+)?-\d+(\.\d+)?$/.test(f)) {
      const [min, max] = f.split("-").map(Number)
      return value >= min && value <= max
    }

    return String(value).includes(filter)
  }

  /* ---------- FILTER + SORT ---------- */
  const processedData = useMemo(() => {
    let rows = [...data]

    rows = rows.filter(row =>
      Object.entries(filters).every(([key, filter]) => {
        if (!filter) return true
        const cell = row[key]

        if (typeof cell === "number") {
          return matchNumberFilter(cell, filter)
        }

        if (typeof cell === "object") return true

        return String(cell)
          .toLowerCase()
          .includes(filter.toLowerCase())
      })
    )

    if (sortKey) {
      rows.sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]

        if (typeof av === "object" || typeof bv === "object") return 0

        if (!isNaN(av as any) && !isNaN(bv as any)) {
          return sortDir === "asc"
            ? Number(av) - Number(bv)
            : Number(bv) - Number(av)
        }

        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av))
      })
    }

    return rows
  }, [data, filters, sortKey, sortDir])

  const totalPages = Math.ceil(processedData.length / pageSize)
  const start = (page - 1) * pageSize
  const pageData = processedData.slice(start, start + pageSize)

  const onSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  /* ---------- PAGINATION ---------- */
  const getPages = (): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const pages: (number | string)[] = [1]
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)

    if (start > 2) pages.push("...")
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < totalPages - 1) pages.push("...")
    pages.push(totalPages)

    return pages
  }

  return (
    <div>
      {/* TABLE */}
      <div className={`overflow-y-auto border rounded ${height}`}>
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              {columns.map(col => (
                <th
                  key={String(col.key)}
                  onClick={() => onSort(col.key)}
                  className="px-3 py-2 text-left font-medium border-b cursor-pointer"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-xs">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              ))}
            </tr>

            <tr>
              {columns.map(col => (
                <th key={String(col.key)} className="px-2 py-1 border-b">
                  <input
                    className="w-full border rounded px-2 py-1 text-xs"
                    placeholder="Filter"
                    value={filters[col.key as string] || ""}
                    onChange={e => {
                      setPage(1)
                      setFilters({
                        ...filters,
                        [col.key]: e.target.value
                      })
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageData.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {columns.map(col => (
                  <td key={String(col.key)} className="px-3 py-2 border-b">
                    {/* ✅ THIS IS THE IMPORTANT PART */}
                    {col.render
                      ? col.render(row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}

            {pageData.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center py-6 text-gray-400"
                >
                  No matching data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex justify-end gap-1 mt-2">
          {getPages().map((p, i) =>
            p === "..." ? (
              <span key={`e-${i}`} className="px-2 text-gray-400">
                ...
              </span>
            ) : (
              <button
                key={`p-${p}-${i}`}
                onClick={() => setPage(p as number)}
                className={`px-3 py-1 rounded text-sm border ${
                  page === p
                    ? "bg-blue-600 text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
