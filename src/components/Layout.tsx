import { ReactNode, useState } from "react";
import Header from "./Header";
import Sidebar, { visibleSections, NavItem, SectionHeading } from "./Sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/roles";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { hrUser } = useAuth();
  // Same grouping as the desktop sidebar; admin-only links stay out of
  // non-admin menus (the route guard enforces it either way).
  const sections = visibleSections(isAdmin(hrUser));

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <Header onMenuClick={handleToggleSidebar} isMenuOpen={isMobile && isSidebarOpen} />

      {/* Desktop sidebar (fixed, wide layout) */}
      <Sidebar />

      {/* Mobile sidebar overlay */}
      {isMobile && isSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          {/* Solid background — the translucent gradient let the page bleed
              through the drawer, making the menu unreadable on mobile. */}
          <div className="w-72 max-w-[80vw] border-r border-border shadow-xl pt-16 bg-background animate-in slide-in-from-left duration-200">
            <nav className="flex flex-col gap-5 p-4 overflow-y-auto h-full">
              {sections.map((section) => (
                <div key={section.title} className="flex flex-col gap-1">
                  <SectionHeading section={section} />
                  {section.items.map((item) => (
                    <NavItem
                      key={item.path}
                      item={item}
                      accent={section.accent}
                      onClick={handleCloseSidebar}
                    />
                  ))}
                </div>
              ))}
            </nav>
          </div>
          <button
            type="button"
            className="flex-1 bg-black/40"
            onClick={handleCloseSidebar}
            aria-label="Close navigation"
          />
        </div>
      )}

      <main
        className={cn(
          // Mobile-first: full-width, generous vertical padding
          "pt-20 pb-8 px-3 sm:px-4 lg:px-8",
          // Leave space for fixed desktop sidebar
          "md:ml-64",
        )}
      >
        {/* Full-width content on desktop, stacked on mobile */}
        <div className="w-full space-y-6">{children}</div>
      </main>
    </div>
  );
}
