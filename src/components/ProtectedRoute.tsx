import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/roles";

type ProtectedRouteProps = {
  children: ReactNode;
  /**
   * Restrict this page to admins. Without it, any signed-in hr_users member
   * may view. This used to be missing entirely, which meant an "hr" user
   * could open /hr-users and change anyone's role — including their own.
   */
  adminOnly?: boolean;
};

export const ProtectedRoute = ({ children, adminOnly }: ProtectedRouteProps) => {
  const { session, hrUser, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="rounded-lg border border-border bg-card px-6 py-8 shadow-sm">
          <p className="text-sm text-muted-foreground">Checking authentication…</p>
        </div>
      </div>
    );
  }

  if (!session || !hrUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Fail closed: if the page is admin-only and this account isn't an admin,
  // say so plainly instead of rendering the page.
  if (adminOnly && !isAdmin(hrUser)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-border bg-card px-6 py-8 text-center shadow-sm">
          <h1 className="mb-2 text-lg font-semibold">This page is for administrators</h1>
          <p className="text-sm text-muted-foreground">
            Your account is set up as {hrUser.role || "HR"}. If you need access,
            ask an administrator to change your role.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
