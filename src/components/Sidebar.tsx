import { Home, FileText, Briefcase, Brain, Users, ScrollText, ClipboardList, Calendar, MessageSquare, FileCheck, Award, ShieldCheck, Archive } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/roles";

export const menuItems = [
  { icon: Home, label: "Dashboard", path: "/dashboard" },
  // Resumes temporarily hidden
  // { icon: FileText, label: "Resumes", path: "/resumes" },
  { icon: Briefcase, label: "Recruitment Hub", path: "/recruitment-hub" },
  { icon: ClipboardList, label: "Shortlist", path: "/shortlist" },
  { icon: Calendar, label: "Interview", path: "/interview" },
  { icon: MessageSquare, label: "Feedback", path: "/feedback" },
  { icon: ShieldCheck, label: "CID Verification", path: "/document-verification" },
  { icon: FileCheck, label: "Offer Letter", path: "/offer-letter" },
  { icon: Award, label: "Experience Letter", path: "/experience-letter" },
  // Admin-only: the route itself is enforced by ProtectedRoute adminOnly;
  // this flag just keeps the link out of non-admin menus.
  { icon: Users, label: "HR Users", path: "/hr-users", adminOnly: true },
  { icon: Archive, label: "Archived Candidates", path: "/archived-candidates" },
  // Logs temporarily hidden
  // { icon: ScrollText, label: "Logs", path: "/logs" },
];

export default function Sidebar() {
  const { hrUser } = useAuth();
  const visibleItems = menuItems.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || isAdmin(hrUser)
  );

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-card border-r border-border shadow-md hidden md:block">
      <nav className="flex flex-col gap-1 p-4 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                "hover:bg-accent hover:text-accent-foreground",
                isActive
                  ? "bg-gradient-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
