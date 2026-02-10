/* eslint-disable react-refresh/only-export-components */
import { createContext, useEffect, useState, ReactNode } from "react";

export type Role = "owner" | "staff";

export type Session = {
  userId: string | null;
  companyId: string | null;
  username: string | null;
  role: Role | null;
  fullName: string;          // camelCase in JS/TS
};

export type SessionContextType = {
  session: Session;
  loading: boolean;
  setSession: (s: Session) => void;
  logout: () => void;
};

const defaultSession: Session = {
  userId: null,
  companyId: null,
  username: null,
  role: null,
  fullName: "",             // default empty string
};

const STORAGE_KEY = "pms_session";

export const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session>(defaultSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Session;
        // Basic validation
        if (parsed && parsed.userId && parsed.companyId && parsed.username && parsed.role) {
          setSessionState(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        console.warn("Invalid session in localStorage", err);
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    setLoading(false);
  }, []);

  const setSession = (s: Session) => {
    setSessionState(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };

  const logout = () => {
    setSessionState(defaultSession);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <SessionContext.Provider value={{ session, loading, setSession, logout }}>
      {children}
    </SessionContext.Provider>
  );
}