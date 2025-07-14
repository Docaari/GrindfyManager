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
  User,
  Users,
  FileText,
  Gamepad2,
  Wrench,
  TrendingUp
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, logout, hasPermission } = useAuth();

  const menuSections = [
    {
      title: 'VISÃO GERAL',
      color: 'green-400',
      items: [
        { path: '/', icon: BarChart3, label: 'Dashboard', permission: null },
        { path: '/library', icon: BookOpen, label: 'Biblioteca', permission: null },
        { path: '/upload', icon: Upload, label: 'Import', permission: null },
      ]
    },
    {
      title: 'GRIND',
      color: 'green-500',
      items: [
        { path: '/planner', icon: Calendar, label: 'Grade', permission: null },
        { path: '/mental', icon: Brain, label: 'Warm Up', permission: null },
        { path: '/grind', icon: Gamepad2, label: 'Grind Live', permission: null },
      ]
    },
    {
      title: 'FERRAMENTAS',
      color: 'green-600',
      items: [
        { path: '/coach', icon: FileText, label: 'Calendário', permission: null },
        { path: '/estudos', icon: BookOpen, label: 'Estudos', permission: null },
        { path: '/calculadoras', icon: Wrench, label: 'Ferramentas', permission: 'premium_features' },
      ]
    },
    {
      title: 'ADMIN',
      color: 'green-700',
      items: [
        { path: '/admin/analytics', icon: TrendingUp, label: 'Analytics', permission: 'admin_full' },
        { path: '/admin/users', icon: Users, label: 'Usuários', permission: 'admin_full' },
      ]
    }
  ];

  const filteredMenuSections = menuSections.map(section => ({
    ...section,
    items: section.items.filter(item => 
      !item.permission || hasPermission(item.permission)
    )
  })).filter(section => section.items.length > 0);

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
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
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
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-6">
          {filteredMenuSections.map((section) => (
            <div key={section.title} className="space-y-2">
              {/* Section Title */}
              {!isCollapsed && (
                <div className="px-3 py-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {section.title}
                  </p>
                </div>
              )}
              
              {/* Section Items */}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive = location === item.path || 
                    (item.path === '/' && (location === '/' || location === '/dashboard'));
                  
                  return (
                    <li key={item.path}>
                      <Link href={item.path}>
                        <a className={`
                          flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
                          ${isActive 
                            ? 'bg-green-600/20 text-green-400 border-l-2 border-green-400' 
                            : 'text-gray-300 hover:bg-green-600/10 hover:text-green-400'
                          }
                        `}>
                          <item.icon size={20} className={`flex-shrink-0 ${isActive ? 'text-green-400' : 'text-gray-400'}`} />
                          {!isCollapsed && (
                            <span className="font-medium">{item.label}</span>
                          )}
                        </a>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              
              {/* Section Separator */}
              {!isCollapsed && (
                <div className="border-t border-gray-700 my-4"></div>
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-700 space-y-2">
        <Link href="/settings">
          <a className={`
            flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
            ${location === '/settings' 
              ? 'bg-green-600/20 text-green-400 border-l-2 border-green-400' 
              : 'text-gray-300 hover:bg-green-600/10 hover:text-green-400'
            }
          `}>
            <Settings size={20} className={`flex-shrink-0 ${location === '/settings' ? 'text-green-400' : 'text-gray-400'}`} />
            {!isCollapsed && (
              <span className="font-medium">Configurações</span>
            )}
          </a>
        </Link>
        
        <button
          onClick={handleLogout}
          className={`
            flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
            text-gray-300 hover:bg-red-600/20 hover:text-red-400 w-full
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