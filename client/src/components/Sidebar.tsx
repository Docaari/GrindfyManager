import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  BarChart3, 
  BookOpen, 
  Calendar, 
  Play, 
  Brain, 
  Lightbulb, 
  Upload, 
  Trophy,
  User,
  Settings
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const navigation = [
  { name: "Dashboard", href: "/", icon: BarChart3 },
  { name: "Tournament Library", href: "/library", icon: BookOpen },
  { name: "Weekly Planner", href: "/planner", icon: Calendar },
  { name: "Grind Session", href: "/grind", icon: Play },
  { name: "Mental Prep", href: "/mental", icon: Brain },
  { name: "Grade Coach", href: "/coach", icon: Lightbulb },
  { name: "Upload History", href: "/upload", icon: Upload },
];

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="w-64 bg-poker-surface border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Trophy className="h-8 w-8 text-poker-gold" />
          <div>
            <h1 className="text-2xl font-bold text-poker-gold">Grindfy</h1>
            <p className="text-gray-400 text-sm">Tournament Tracker</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.name}>
                <button
                  onClick={() => setLocation(item.href)}
                  className={cn(
                    "w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors",
                    isActive
                      ? "bg-poker-green text-white"
                      : "text-gray-300 hover:text-white hover:bg-gray-700"
                  )}
                >
                  <item.icon className="h-5 w-5 mr-3" />
                  {item.name}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center mb-3">
          <div className="w-10 h-10 bg-poker-green rounded-full flex items-center justify-center mr-3">
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
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.firstName && user?.lastName 
                ? `${user.firstName} ${user.lastName}`
                : user?.email || "Poker Player"
              }
            </p>
            <p className="text-xs text-gray-400">Professional</p>
          </div>
        </div>
        
        <div className="space-y-1">
          <button
            onClick={() => setLocation("/settings")}
            className="w-full flex items-center px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors text-sm"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors text-sm"
          >
            <Upload className="h-4 w-4 mr-2 rotate-180" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
