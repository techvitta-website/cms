import type { ComponentType } from "react";
import {
  Home, Briefcase, GraduationCap, Radar, ClipboardList, Calendar,
  MessageSquare, ShieldCheck, FileCheck, Award, Users, Archive, FileX2,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/roles";

export type AccentKey = "blue" | "violet" | "amber" | "emerald" | "rose";

export type MenuItem = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  path: string;
  adminOnly?: boolean;
};

export type MenuSection = {
  title: string;
  accent: AccentKey;
  items: MenuItem[];
};

// Per-module colour system. Class strings are written out in full (not string
// interpolation) so Tailwind's content scanner keeps them in the production build.
export const ACCENTS: Record<AccentKey, {
  dot: string;
  label: string;
  iconIdle: string;
  tileIdle: string;
  hover: string;
  activeGradient: string;
}> = {
  blue: {
    dot: "bg-blue-500",
    label: "text-blue-600 dark:text-blue-400",
    iconIdle: "text-blue-600 dark:text-blue-400",
    tileIdle: "bg-blue-500/10",
    hover: "hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-300",
    activeGradient: "from-blue-500 to-indigo-600",
  },
  violet: {
    dot: "bg-violet-500",
    label: "text-violet-600 dark:text-violet-400",
    iconIdle: "text-violet-600 dark:text-violet-400",
    tileIdle: "bg-violet-500/10",
    hover: "hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300",
    activeGradient: "from-violet-500 to-fuchsia-600",
  },
  amber: {
    dot: "bg-amber-500",
    label: "text-amber-600 dark:text-amber-400",
    iconIdle: "text-amber-600 dark:text-amber-400",
    tileIdle: "bg-amber-500/10",
    hover: "hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300",
    activeGradient: "from-amber-500 to-orange-600",
  },
  emerald: {
    dot: "bg-emerald-500",
    label: "text-emerald-600 dark:text-emerald-400",
    iconIdle: "text-emerald-600 dark:text-emerald-400",
    tileIdle: "bg-emerald-500/10",
    hover: "hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300",
    activeGradient: "from-emerald-500 to-teal-600",
  },
  rose: {
    dot: "bg-rose-500",
    label: "text-rose-600 dark:text-rose-400",
    iconIdle: "text-rose-600 dark:text-rose-400",
    tileIdle: "bg-rose-500/10",
    hover: "hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300",
    activeGradient: "from-rose-500 to-pink-600",
  },
};

// The navigation, grouped into functional modules. Each module has its own accent.
export const menuSections: MenuSection[] = [
  {
    title: "Overview",
    accent: "blue",
    items: [
      { icon: Home, label: "Dashboard", path: "/dashboard" },
    ],
  },
  {
    title: "Talent Sourcing",
    accent: "violet",
    items: [
      { icon: Briefcase, label: "Recruitment Hub", path: "/recruitment-hub" },
      { icon: GraduationCap, label: "Intern Screening", path: "/intern-screening" },
      { icon: Radar, label: "Source Interns", path: "/intern-sourcing" },
    ],
  },
  {
    title: "Pipeline",
    accent: "amber",
    items: [
      { icon: ClipboardList, label: "Shortlist", path: "/shortlist" },
      { icon: Calendar, label: "Interview", path: "/interview" },
      { icon: MessageSquare, label: "Feedback", path: "/feedback" },
    ],
  },
  {
    title: "Verification & Documents",
    accent: "emerald",
    items: [
      { icon: ShieldCheck, label: "CID Verification", path: "/document-verification" },
      { icon: FileCheck, label: "Offer Letter", path: "/offer-letter" },
      { icon: Award, label: "Experience Letter", path: "/experience-letter" },
      { icon: FileX2, label: "Rejection/Feedback Letter", path: "/rejection-letter" },
    ],
  },
  {
    title: "Administration",
    accent: "rose",
    items: [
      { icon: Users, label: "HR Users", path: "/hr-users", adminOnly: true },
      { icon: Archive, label: "Archived Candidates", path: "/archived-candidates" },
    ],
  },
];

// Flat list kept for backward compatibility with any existing importer.
export const menuItems: MenuItem[] = menuSections.flatMap((s) => s.items);

// Filter admin-only links for the given user, dropping any now-empty sections.
export function visibleSections(admin: boolean): MenuSection[] {
  return menuSections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.adminOnly || admin) }))
    .filter((s) => s.items.length > 0);
}

// One nav link, shared by the desktop sidebar and the mobile drawer.
export function NavItem({
  item,
  accent,
  onClick,
}: {
  item: MenuItem;
  accent: AccentKey;
  onClick?: () => void;
}) {
  const a = ACCENTS[accent];
  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
          isActive
            ? cn("bg-gradient-to-br text-white shadow-md", a.activeGradient)
            : cn("text-foreground/70", a.hover),
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors",
              isActive ? "bg-white/20 text-white" : cn(a.tileIdle, a.iconIdle),
            )}
          >
            <item.icon className="h-[18px] w-[18px]" />
          </span>
          <span className="font-medium text-sm">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

// A module heading with its accent dot.
export function SectionHeading({ section }: { section: MenuSection }) {
  return (
    <div className="flex items-center gap-2 px-2 mb-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", ACCENTS[section.accent].dot)} />
      <span
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider",
          ACCENTS[section.accent].label,
        )}
      >
        {section.title}
      </span>
    </div>
  );
}

export default function Sidebar() {
  const { hrUser } = useAuth();
  const sections = visibleSections(isAdmin(hrUser));

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 hidden md:block border-r border-border bg-gradient-to-b from-card to-muted/40">
      <nav className="flex flex-col gap-5 p-4 overflow-y-auto h-full">
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <SectionHeading section={section} />
            {section.items.map((item) => (
              <NavItem key={item.path} item={item} accent={section.accent} />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
