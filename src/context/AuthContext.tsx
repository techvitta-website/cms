import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";

type HrUser = Tables<"hr_users"> | null;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  hrUser: HrUser;
  initializing: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fetchHrUser = async (userEmail: string) => {
  const { data, error } = await supabase
    .from("hr_users")
    .select("*")
    .eq("email", userEmail)
    .eq("role", "hr")
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch HR user", error);
    return { data: null, error };
  }

  return { data, error: null };
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hrUser, setHrUser] = useState<HrUser>(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const applySession = async (newSession: Session | null) => {
      if (!isMounted) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user?.email) {
        const { data: hrProfile } = await fetchHrUser(newSession.user.email);
        if (hrProfile) {
          setHrUser(hrProfile);
          return;
        }

        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.error("Error signing out unauthorized user", err);
        }
      }

      setHrUser(null);
      setSession(null);
      setUser(null);
    };

    setInitializing(true);

    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error) {
          console.error("Error fetching session", error);
          return;
        }

        await applySession(data.session ?? null);
      })
      .catch((err) => {
        console.error("Error during auth initialization", err);
        if (isMounted) {
          setSession(null);
          setUser(null);
          setHrUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setInitializing(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void applySession(newSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.session?.user) {
        return { success: false, error: error?.message ?? "Invalid credentials" };
      }

      const { data: hrProfile } = await fetchHrUser(email);
      if (!hrProfile) {
        await supabase.auth.signOut();
        return { success: false, error: "Access denied. HR role required." };
      }

      setSession(data.session);
      setUser(data.session.user);
      setHrUser(hrProfile);

      return { success: true };
    } catch (err) {
      console.error("Login error", err);
      return { success: false, error: "Unexpected error occurred. Please try again." };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setHrUser(null);
    } catch (error) {
      console.error("Logout error", error);
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      hrUser,
      initializing,
      loading,
      login,
      logout,
    }),
    [session, user, hrUser, initializing, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

