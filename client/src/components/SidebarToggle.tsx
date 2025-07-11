import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/contexts/SidebarContext";

export default function SidebarToggle() {
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleSidebar}
      className="fixed top-4 left-4 z-50 bg-poker-surface border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 shadow-lg"
    >
      {isCollapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
    </Button>
  );
}