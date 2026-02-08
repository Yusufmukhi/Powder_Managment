import { useEffect, useRef, useState } from "react"

type Option = {
  id: string
  label: string
}

type Props = {
  placeholder: string
  options: Option[]
  value: Option | null
  onChange: (v: Option | null) => void
  disabled?: boolean
  className?: string
}

export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder
}: Props) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase())
  )

  // --------------------------------
  // CLOSE ON OUTSIDE CLICK
  // --------------------------------
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // --------------------------------
  // AUTO SCROLL ACTIVE ITEM
  // --------------------------------
  useEffect(() => {
    const el = itemRefs.current[active]
    if (el) {
      el.scrollIntoView({
        block: "nearest",
        behavior: "smooth"
      })
    }
  }, [active])

  // --------------------------------
  // KEYBOARD NAVIGATION
  // --------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive(i => Math.min(i + 1, filtered.length - 1))
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    }

    if (e.key === "Enter" && filtered[active]) {
      e.preventDefault()
      onChange(filtered[active])
      setQuery("")
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className="border p-2 rounded w-full"
        placeholder={placeholder}
        value={value ? value.label : query}
        onFocus={() => setOpen(true)}
        onChange={e => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow max-h-48 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">
              No matches
            </div>
          )}

          {filtered.map((o, i) => (
            <div
              key={o.id}
              ref={el => (itemRefs.current[i] = el)}
              onClick={() => {
                onChange(o)
                setQuery("")
                setOpen(false)
              }}
              className={`px-3 py-2 cursor-pointer text-sm ${
                i === active
                  ? "bg-blue-100"
                  : "hover:bg-blue-50"
              }`}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
