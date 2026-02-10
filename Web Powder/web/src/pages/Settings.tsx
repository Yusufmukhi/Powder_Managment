// src/pages/Settings.tsx
import { useEffect, useState } from "react";
import { useSession } from "../context/useSession";
import { supabase } from "../lib/supabase";

type Tab = "profile" | "powders" | "clients" | "suppliers" | "users" | "company";

export default function Settings() {
  const { session, loading: sessionLoading } = useSession();

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const isOwner = session?.role === "owner";

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!session || !session.companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600 font-medium">
        Please log in to access settings
      </div>
    );
  }

  const tabs = [
  { id: "profile" as const, label: "My Profile", visible: true },
  { id: "powders" as const, label: "Powders", visible: isOwner },
  { id: "clients" as const, label: "Clients", visible: isOwner },
  { id: "suppliers" as const, label: "Suppliers", visible: isOwner },
  { id: "users" as const, label: "Users", visible: isOwner },
  { id: "company" as const, label: "Company Profile", visible: isOwner },
] satisfies { id: Tab; label: string; visible: boolean }[];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Settings</h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8 overflow-x-auto">
          <nav className="flex space-x-4 sm:space-x-8" aria-label="Tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm sm:text-base whitespace-nowrap
                  ${activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="bg-white shadow rounded-xl p-6 sm:p-8">
          {activeTab === "profile" && <MyProfileTab />}
          {activeTab === "powders" && isOwner && <PowdersTab />}
          {activeTab === "clients" && isOwner && <ClientsTab />}
          {activeTab === "suppliers" && isOwner && <SuppliersTab />}
          {activeTab === "users" && isOwner && <UsersTab />}
          {activeTab === "company" && isOwner && <CompanyProfileTab />}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// My Profile (available to both owner & staff)
// ────────────────────────────────────────────────
function MyProfileTab() {
  const { session, setSession } = useSession();
  const [fullName, setFullName] = useState(session?.fullName || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (session?.fullName) {
      setFullName(session.fullName);
    }
  }, [session]);

  const handleUpdateProfile = async () => {
    if (!session?.userId) return;

    setLoading(true);
    setMessage(null);

    try {
      const updates: any = {};

      if (fullName.trim() && fullName !== session.fullName) {
        updates.full_name = fullName.trim();
      }

      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error("New passwords do not match");
        }
        if (!currentPassword) {
          throw new Error("Current password is required to change password");
        }

        // Change password via Supabase Auth
        const { error: pwError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (pwError) throw pwError;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from("users")
          .update(updates)
          .eq("id", session.userId);

        if (error) throw error;

        // Update session
        setSession({
          ...session,
          fullName: fullName.trim(),
        });
      }

      setMessage({ text: "Profile updated successfully", type: "success" });
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to update profile", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-gray-900">My Profile</h2>

      {message && (
        <div
          className={`p-4 rounded-lg border-l-4 ${
            message.type === "success" ? "bg-green-50 border-green-500 text-green-700" : "bg-red-50 border-red-500 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Username (cannot change)</label>
          <input
            type="text"
            value={session?.username || ""}
            disabled
            className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-gray-100 cursor-not-allowed"
          />
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-4">Change Password</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="pt-6">
        <button
          onClick={handleUpdateProfile}
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Company Profile (Owner only)
// ────────────────────────────────────────────────
function CompanyProfileTab() {
  const { session } = useSession();
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadCompany();
  }, [session?.companyId]);

  const loadCompany = async () => {
    if (!session?.companyId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", session.companyId)
      .single();

    if (error) {
      setMessage({ text: "Failed to load company profile", type: "error" });
    } else {
      setCompany(data || {});
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("companies")
        .update({
          company_name: company.company_name?.trim() || null,
          director: company.director?.trim() || null,
          address: company.address?.trim() || null,
          city: company.city?.trim() || null,
          state: company.state?.trim() || null,
          pincode: company.pincode?.trim() || null,
          phone: company.phone?.trim() || null,
          email: company.email?.trim() || null,
          gstin: company.gstin?.trim().toUpperCase() || null,
        })
        .eq("id", session?.companyId);

      if (error) throw error;

      setMessage({ text: "Company profile updated successfully", type: "success" });
      setTimeout(() => setMessage(null), 4000);
      loadCompany();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to update company", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-gray-500">Loading company profile...</div>;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-gray-900">Company Profile</h2>

      {message && (
        <div
          className={`p-4 rounded-lg border-l-4 ${
            message.type === "success" ? "bg-green-50 border-green-500 text-green-700" : "bg-red-50 border-red-500 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
          <input
            type="text"
            value={company.company_name || ""}
            onChange={e => setCompany({ ...company, company_name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Director / Authorized Signatory</label>
          <input
            type="text"
            value={company.director || ""}
            onChange={e => setCompany({ ...company, director: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea
            value={company.address || ""}
            onChange={e => setCompany({ ...company, address: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 min-h-[80px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            value={company.city || ""}
            onChange={e => setCompany({ ...company, city: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <input
            type="text"
            value={company.state || ""}
            onChange={e => setCompany({ ...company, state: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
          <input
            type="text"
            value={company.pincode || ""}
            onChange={e => setCompany({ ...company, pincode: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="text"
            value={company.phone || ""}
            onChange={e => setCompany({ ...company, phone: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={company.email || ""}
            onChange={e => setCompany({ ...company, email: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
          <input
            type="text"
            value={company.gstin || ""}
            onChange={e => setCompany({ ...company, gstin: e.target.value.toUpperCase() })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="pt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Company Details"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Powders Tab (Owner only) – basic CRUD skeleton
// ────────────────────────────────────────────────
function PowdersTab() {
  const { session } = useSession();  // ← ADD THIS LINE (now session is available)

  const [powders, setPowders] = useState<any[]>([]);
  const [newPowderName, setNewPowderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadPowders();
  }, [session?.companyId]);  // ← depend on companyId

  const loadPowders = async () => {
    if (!session?.companyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("powders")
        .select("id, powder_name, created_at")
        .eq("company_id", session.companyId)  // ← filter by company
        .order("powder_name");

      if (error) throw error;
      setPowders(data || []);
    } catch (err: any) {
      setMessage({ text: "Failed to load powders", type: "error" });
    }
    setLoading(false);
  };

  const addPowder = async () => {
    if (!newPowderName.trim()) {
      setMessage({ text: "Powder name is required", type: "error" });
      return;
    }

    if (!session?.companyId) {
      setMessage({ text: "No company selected – please log in again", type: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("powders")
        .insert({
          powder_name: newPowderName.trim(),
          company_id: session.companyId,  // ← this prevents 400 error
        });

      if (error) throw error;

      setNewPowderName("");
      loadPowders();
      setMessage({ text: "Powder added successfully", type: "success" });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      console.error("Add powder error:", err);
      setMessage({
        text: err.message?.includes("duplicate") 
          ? "A powder with this name already exists" 
          : "Failed to add powder. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Manage Powders</h2>

      {message && (
        <div
          className={`p-4 rounded-lg border-l-4 ${
            message.type === "success" ? "bg-green-50 border-green-500 text-green-700" : "bg-red-50 border-red-500 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={newPowderName}
          onChange={e => setNewPowderName(e.target.value)}
          placeholder="Enter new powder name"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          onClick={addPowder}
          disabled={loading || !newPowderName.trim()}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? "Adding..." : "Add Powder"}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading powders...</div>
      ) : powders.length === 0 ? (
        <div className="text-center py-10 text-gray-500">No powders added yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Powder Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {powders.map(p => (
                <tr key={p.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium">{p.powder_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// Clients / Suppliers / Users Tabs (skeleton – copy-paste pattern)
// ────────────────────────────────────────────────
function ClientsTab() {
  const { session } = useSession();
  const [clients, setClients] = useState<any[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadClients();
  }, [session?.companyId]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, client_name, created_at")
        .eq("company_id", session?.companyId)
        .order("client_name");

      if (error) throw error;
      setClients(data || []);
    } catch (err: any) {
      setMessage({ text: "Failed to load clients", type: "error" });
    }
    setLoading(false);
  };

  const addClient = async () => {
    if (!newClientName.trim()) {
      setMessage({ text: "Client name is required", type: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("clients")
        .insert({
          client_name: newClientName.trim(),
          company_id: session?.companyId,
        });

      if (error) throw error;

      setNewClientName("");
      loadClients();
      setMessage({ text: "Client added successfully", type: "success" });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({
        text: err.message?.includes("duplicate") ? "Client name already exists" : "Failed to add client",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Manage Clients</h2>

      {message && (
        <div
          className={`p-4 rounded-lg border-l-4 ${
            message.type === "success" ? "bg-green-50 border-green-500 text-green-700" : "bg-red-50 border-red-500 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={newClientName}
          onChange={e => setNewClientName(e.target.value)}
          placeholder="Enter new client name"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={addClient}
          disabled={loading || !newClientName.trim()}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg disabled:bg-gray-400"
        >
          Add Client
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading clients...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-10 text-gray-500">No clients added yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {clients.map(c => (
                <tr key={c.id}>
                  <td className="px-6 py-4 whitespace-nowrap">{c.client_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SuppliersTab() {
  return <div className="py-10 text-center text-gray-600">Suppliers management coming soon...</div>;
}

function UsersTab() {
  return <div className="py-10 text-center text-gray-600">Users management (role change) coming soon...</div>;
}