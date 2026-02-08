import { NavLink, useNavigate } from "react-router-dom"
import { useSession } from "../context/useSession"

type Props = {
  onMenuClick: () => void
}

export default function Navbar({ onMenuClick }: Props) {
  const { session, logout } = useSession()
  const navigate = useNavigate()

  const linkClass = ({ isActive }: any) =>
    `px-3 py-2 rounded text-sm font-medium ${
      isActive
        ? "bg-blue-600 text-white"
        : "text-gray-700 hover:bg-gray-100"
    }`

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  return (
    <header className="bg-white border-b">
      <div className="max-w-7xl mx-auto h-14 px-4 flex items-center justify-between">
        
        {/* LEFT */}
        <div className="flex items-center gap-2">
          {/* ☰ Hamburger (mobile only) */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 rounded hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <span className="font-semibold text-blue-600 whitespace-nowrap">
            Powder Management
          </span>

          {/* DESKTOP MENU */}
          <nav className="hidden md:flex gap-1 ml-4">
            <NavLink to="/" className={linkClass}>Home</NavLink>
            <NavLink to="/add-stock" className={linkClass}>Add Stock</NavLink>
            <NavLink to="/usage" className={linkClass}>Usage</NavLink>

            {session.role === "owner" && (
              <>
                <NavLink to="/analysis" className={linkClass}>Analysis</NavLink>
                <NavLink to="/purchase-order" className={linkClass}>PO</NavLink>
                <NavLink to="/activity" className={linkClass}>Activity</NavLink>
                <NavLink to="/settings" className={linkClass}>Settings</NavLink>
              </>
            )}
          </nav>
        </div>

        {/* RIGHT */}
        <button
          onClick={handleLogout}
          className="text-sm text-red-600 hover:underline"
        >
          Logout
        </button>
      </div>
    </header>
  )
}
