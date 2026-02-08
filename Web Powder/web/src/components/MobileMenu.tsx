import { NavLink } from "react-router-dom"
import { useSession } from "../context/useSession"

type Props = {
  open: boolean
  onClose: () => void
}

export default function MobileMenu({ open, onClose }: Props) {
  const { session } = useSession()
  if (!open) return null

  const link =
    "block w-full text-left px-5 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"

  return (
    <div className="md:hidden bg-white border-b shadow-sm">
      <nav className="py-2">
        <NavLink to="/" className={link} onClick={onClose}>Home</NavLink>
        <NavLink to="/add-stock" className={link} onClick={onClose}>Add Stock</NavLink>
        <NavLink to="/usage" className={link} onClick={onClose}>Usage</NavLink>

        {session.role === "owner" && (
          <>
            <div className="my-2 border-t" />
            <NavLink to="/analysis" className={link} onClick={onClose}>Analysis</NavLink>
            <NavLink to="/purchase-order" className={link} onClick={onClose}>Purchase Order</NavLink>
            <NavLink to="/activity" className={link} onClick={onClose}>Activity Log</NavLink>
            <NavLink to="/settings" className={link} onClick={onClose}>Settings</NavLink>
          </>
        )}
      </nav>
    </div>
  )
}
