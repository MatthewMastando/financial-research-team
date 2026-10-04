import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { db, isDemo } from "./data";
type AuthState = {
  session: Session | null;
  state: "loading" | "owner" | "login" | "denied" | "setup" | "error";
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<AuthState["state"]>(
    isDemo ? "owner" : db ? "loading" : "setup",
  );
  const qc = useQueryClient();
  const currentUser = useRef<string | null>(null);
  useEffect(() => {
    if (!db) return;
    let alive = true;
    db.auth.getSession().then(({ data, error }) => {
      if (alive) {
        setSession(data.session);
        if (error) setState("error");
        else if (!data.session) setState("login");
      }
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, s) => {
      const nextUser = s?.user.id ?? null;
      if (nextUser !== currentUser.current) {
        qc.clear();
        setState(nextUser ? "loading" : "login");
        currentUser.current = nextUser;
      }
      setSession(s);
      if (!s) {
        qc.clear();
        setState("login");
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [qc]);
  useEffect(() => {
    if (!session || !db) return;
    let alive = true;
    setState("loading");
    db.from("app_owner")
      .select("owner_id")
      .eq("owner_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (alive) setState(error ? "error" : data ? "owner" : "denied");
      });
    return () => {
      alive = false;
    };
  }, [session]);
  const signOut = async () => {
    qc.clear();
    if (db) {
      const { error } = await db.auth.signOut();
      if (error) throw error;
    }
    setSession(null);
    setState(isDemo ? "owner" : "login");
  };
  return (
    <AuthContext.Provider value={{ session, state, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
