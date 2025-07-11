import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  BarChart3, 
  BookOpen, 
  Calendar, 
  Play, 
  Zap,
  Brain, 
  Lightbulb, 
  Upload, 
  Trophy,
  User,
  Settings,
  History,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/contexts/SidebarContext";
import { Button } from "@/components/ui/button";

const navigationSections = [
  {
    items: [
      { name: "Dashboard", href: "/", icon: BarChart3 },
      { name: "Biblioteca", href: "/library", icon: BookOpen },
      { name: "Upload", href: "/upload", icon: Upload },
    ]
  },
  {
    items: [
      { name: "Warm Up", href: "/mental", icon: Brain },
      { name: "Grind", href: "/grind", icon: Play },
      { name: "Grade", href: "/coach", icon: Lightbulb },
    ]
  },
  {
    items: [
      { name: "Rotina", href: "/planner", icon: Calendar },
      { name: "Estudos", href: "/estudos", icon: BookOpen },
      { name: "Calculadoras", href: "/calculadoras", icon: BarChart3 },
    ]
  }
];

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className={cn(
      "bg-poker-surface border-r border-gray-700 flex flex-col transition-all duration-300 ease-in-out",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="p-6 border-b border-gray-700 relative">
        <div className="flex items-center space-x-2">
          <Trophy className="h-8 w-8 text-poker-gold" />
          {!isCollapsed && (
            <div>
              <h1 className="text-2xl font-bold text-poker-gold">Grindfy</h1>
              <p className="text-gray-400 text-sm">Tournament Tracker</p>
            </div>
          )}
        </div>
        
        {/* Toggle Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="absolute top-4 right-4 text-gray-400 hover:text-white hover:bg-gray-700"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-6">
          {navigationSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              <ul className="space-y-2">
                {section.items.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <li key={item.name}>
                      <button
                        onClick={() => setLocation(item.href)}
                        className={cn(
                          "w-full flex items-center text-left rounded-lg transition-colors",
                          isCollapsed ? "px-2 py-3 justify-center" : "px-4 py-3",
                          isActive
                            ? "bg-poker-green text-white"
                            : "text-gray-300 hover:text-white hover:bg-gray-700"
                        )}
                        title={isCollapsed ? item.name : undefined}
                      >
                        <item.icon className={cn("h-5 w-5", !isCollapsed && "mr-3")} />
                        {!isCollapsed && item.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {sectionIndex < navigationSections.length - 1 && (
                <div className="border-t border-gray-700 mt-4"></div>
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-700">
        <div className={cn("flex items-center mb-3", isCollapsed && "justify-center")}>
          <div className="w-10 h-10 bg-poker-green rounded-full flex items-center justify-center">
            {user?.profileImageUrl ? (
              <img 
                src={user.profileImageUrl} 
                alt="Profile" 
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-white" />
            )}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0 ml-3">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName && user?.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user?.email || "Poker Player"
                }
              </p>
              <p className="text-xs text-gray-400">Professional</p>
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <button
            onClick={() => setLocation("/settings")}
            className={cn(
              "w-full flex items-center text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors text-sm",
              isCollapsed ? "px-2 py-2 justify-center" : "px-3 py-2"
            )}
            title={isCollapsed ? "Settings" : undefined}
          >
            <Settings className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
            {!isCollapsed && "Settings"}
          </button>
          <button
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors text-sm",
              isCollapsed ? "px-2 py-2 justify-center" : "px-3 py-2"
            )}
            title={isCollapsed ? "Logout" : undefined}
          >
            <Upload className={cn("h-4 w-4 rotate-180", !isCollapsed && "mr-2")} />
            {!isCollapsed && "Logout"}
          </button>
        </div>
      </div>
    </div>
  );
}
