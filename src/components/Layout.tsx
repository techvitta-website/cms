import { ReactNode, useState } from "react";
import Header from "./Header";
import Sidebar, { menuItems } from "./Sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { NavLink } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <Header onMenuClick={handleToggleSidebar} />

      {/* Desktop sidebar (fixed, wide layout) */}
      <Sidebar />

      {/* Mobile sidebar overlay */}
      {isMobile && isSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-72 max-w-[80vw] bg-card border-r border-border shadow-lg pt-16">
            <nav className="flex flex-col gap-1 p-4 overflow-y-auto">
              {menuItems.map((item) => (
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
                  onClick={handleCloseSidebar}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
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
