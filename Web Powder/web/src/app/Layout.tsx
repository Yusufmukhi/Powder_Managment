import { useState } from "react"
import Navbar from "../components/Navbar"
import MobileMenu from "../components/MobileMenu"

export default function Layout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar onMenuClick={() => setMenuOpen(!menuOpen)} />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="max-w-7xl mx-auto px-2 sm:px-4">
        {children}
      </main>
    </div>
  )
}
