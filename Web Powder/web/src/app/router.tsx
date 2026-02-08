import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"

import Login from "../pages/Login"
import Dashboard from "../pages/Dashboard"
import AddStock from "../pages/AddStock"
import Usage from "../pages/Usage"
import Analysis from "../pages/Analysis"
import PurchaseOrder from "../pages/PurchaseOrder"



import ProtectedRoute from "./ProtectedRoute"
import Layout from "./Layout"

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 🔓 PUBLIC ROUTE */}
        <Route path="/login" element={<Login />} />

        {/* 🔐 PROTECTED ROUTES */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/add-stock"
          element={
            <ProtectedRoute>
              <Layout>
                <AddStock />
              </Layout>
            </ProtectedRoute>
          }
        />

         <Route
          path="/usage"
          element={
            <ProtectedRoute>
              <Layout>
                <Usage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/analysis"
          element={
            <ProtectedRoute role="owner">
              <Layout>
                <Analysis />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/purchase-order"
          element={ 
            <ProtectedRoute role="owner">
              <Layout>
                <PurchaseOrder />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* <Route
          path="/activity"
          element={
            <ProtectedRoute role="owner">
              <Layout>
                <ActivityLog />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute role="owner">
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />  */}

        {/* 🧹 FALLBACK */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
