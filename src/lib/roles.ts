import type { Tables } from "@/integrations/supabase/types";

type HrUser = Tables<"hr_users"> | null;

/**
 * Get user role (with fallback to 'hr')
 */
export const getUserRole = (hrUser: HrUser | null): string => {
  return hrUser?.role?.toLowerCase() || 'hr';
};

/**
 * Get role display name
 */
export const getRoleDisplayName = (hrUser: HrUser | null): string => {
  const role = getUserRole(hrUser);
  if (role === 'admin') return 'Admin';
  if (role === 'hr') return 'HR';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

/**
 * Check if user is Admin
 */
export const isAdmin = (hrUser: HrUser | null): boolean => {
  return hrUser?.role?.toLowerCase() === 'admin';
};

/**
 * Check if user is HR
 */
export const isHR = (hrUser: HrUser | null): boolean => {
  return hrUser?.role?.toLowerCase() === 'hr';
};

/**
 * Check if user can reset passwords (Admin only)
 */
export const canResetPassword = (hrUser: HrUser | null): boolean => {
  return isAdmin(hrUser);
};

