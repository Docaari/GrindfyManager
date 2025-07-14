import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import {
  BarChart3,
  Upload,
  Calendar,
  PlayCircle,
  Brain,
  Trophy,
  Settings,
  BookOpen,
  Calculator,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, logout, hasPermission } = useAuth();

  const menuItems = [
    { path: '/', icon: BarChart3, label: 'Dashboard', permission: null },
    { path: '/library', icon: BookOpen, label: 'Biblioteca', permission: null },
    { path: '/planner', icon: Calendar, label: 'Planejador', permission: null },
    { path: '/grind', icon: PlayCircle, label: 'Grind Live', permission: null },
    { path: '/mental', icon: Brain, label: 'Mental Prep', permission: null },
    { path: '/coach', icon: Trophy, label: 'Coach', permission: null },
    { path: '/upload', icon: Upload, label: 'Import', permission: null },
    { path: '/estudos', icon: BookOpen, label: 'Estudos', permission: null },
    { path: '/calculadoras', icon: Calculator, label: 'Calculadoras', permission: 'premium_features' },
    { path: '/settings', icon: Settings, label: 'Configurações', permission: null },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    !item.permission || hasPermission(item.permission)
  );

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className={`
      ${isCollapsed ? 'w-16' : 'w-64'} 
      h-full bg-gray-900 border-r border-gray-700 flex flex-col transition-all duration-300
    `}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <h1 className="text-xl font-bold text-white">
              Grind<span className="text-red-500">fy</span>
            </h1>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
      </div>

      {/* User Info */}
      {!isCollapsed && (
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName || user?.username || 'Usuário'}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {user?.email}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {filteredMenuItems.map((item) => {
            const isActive = location === item.path || 
              (item.path === '/' && (location === '/' || location === '/dashboard'));
            
            return (
              <li key={item.path}>
                <Link href={item.path}>
                  <a className={`
                    flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors
                    ${isActive 
                      ? 'bg-red-600 text-white' 
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }
                  `}>
                    <item.icon size={20} className="flex-shrink-0" />
                    {!isCollapsed && (
                      <span className="font-medium">{item.label}</span>
                    )}
                  </a>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className={`
            flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors
            text-gray-300 hover:bg-red-600 hover:text-white w-full
          `}
        >
          <LogOut size={20} className="flex-shrink-0" />
          {!isCollapsed && (
            <span className="font-medium">Sair</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;