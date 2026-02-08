import { Navigate } from "react-router-dom"
import { useSession } from "../context/useSession"
import React from "react"


export default function ProtectedRoute({
  role,
  children
}: {
  role?: "owner" | "staff"
  children: React.ReactNode
}) {
  const { session, loading } = useSession()

  // ⏳ WAIT for session restore
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-500">Loading...</span>
      </div>
    )
  }

  // 🔐 NOT logged in
  if (!session.userId) {
    return <Navigate to="/login" />
  }

  // 🔒 ROLE CHECK
  if (role && session.role !== role) {
    return <Navigate to="/" />
  }

  return children
}
