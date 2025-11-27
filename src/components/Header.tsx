import { LogOut, Menu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { hrUser, logout, loading } = useAuth();
  const isMobile = useIsMobile();

  const initials = "HR";

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-card border-b border-border shadow-sm z-50">
      <div className="flex items-center justify-between h-full px-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="inline-flex items-center justify-center mr-1 h-9 w-9 rounded-md border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation</span>
          </button>
          <img
            src="https://res.cloudinary.com/ddw4avyim/image/upload/v1763711488/WhatsApp_Image_2025-11-21_at_13.20.07_d46f25ce_h7bnay.jpg"
            alt="Logo"
            className="h-8 w-auto object-contain sm:h-9 md:h-10"
          />
          <h1 className="text-lg sm:text-xl font-bold leading-tight text-foreground">
            TechVitta CMS
          </h1>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden xs:block text-right">
            <p className="text-xs sm:text-sm font-medium text-foreground truncate max-w-[140px] sm:max-w-xs">
              {hrUser?.name ?? "HR Admin"}
            </p>
            <p className="hidden sm:block text-xs text-muted-foreground truncate max-w-[180px]">
              {hrUser?.email ?? "hr@company.com"}
            </p>
          </div>
          <Avatar className="h-9 w-9 sm:h-10 sm:w-10 border-2 border-primary">
            <AvatarFallback className="bg-gradient-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Button
            variant="outline"
            size={isMobile ? "icon" : "sm"}
            onClick={() => void logout()}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            {!isMobile && (loading ? "Signing out…" : "Logout")}
          </Button>
        </div>
      </div>
    </header>
  );
}
