import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import BugReportModal from '@/components/BugReportModal';
import ImprovementSuggestionModal from '@/components/ImprovementSuggestionModal';
import ProTag from '@/components/ProTag';
import logoImage from '@assets/image_1753377238747.png';
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
  Gamepad2,
  Wrench,
  TrendingUp,
  Bug,
  Lightbulb,
  CreditCard
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
        { path: '/', icon: User, label: 'Home', permission: null, hasPro: false },
        { path: '/dashboard', icon: BarChart3, label: 'Dashboard', permission: null, hasPro: false },
        { path: '/upload', icon: Upload, label: 'Import', permission: null, hasPro: false },
        { path: '/library', icon: BookOpen, label: 'Biblioteca', permission: null, hasPro: true },
      ]
    },
    {
      title: 'GRIND',
      color: 'green-500',
      items: [
        { path: '/coach', icon: Calendar, label: 'Grade', permission: null, hasPro: false },
        { path: '/grind', icon: Gamepad2, label: 'Grind', permission: null, hasPro: false },
        { path: '/mental', icon: Brain, label: 'Warm Up', permission: null, hasPro: true },
      ]
    },
    {
      title: 'FERRAMENTAS',
      color: 'green-600',
      items: [
        { path: '/estudos', icon: BookOpen, label: 'Estudos', permission: null, hasPro: true },
        { path: '/calculadoras', icon: Wrench, label: 'Ferramentas', permission: 'premium_features', hasPro: true },
      ]
    },
    {
      title: 'ADMIN',
      color: 'green-700',
      items: [
        { path: '/analytics', icon: TrendingUp, label: 'Analytics', permission: 'analytics_access', hasPro: false },
        { path: '/admin/users', icon: Users, label: 'Usuários', permission: 'admin_full', hasPro: false },
        { path: '/admin/bugs', icon: Bug, label: 'Bugs', permission: 'admin_full', hasPro: false },
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
            <div className="flex items-center space-x-3">
              <img 
                src={logoImage} 
                alt="Grindfy Logo" 
                className="w-8 h-8 flex-shrink-0"
              />
              <h1 className="text-xl font-bold text-white">
                Grind<span className="text-[#15a24e]">fy</span>
              </h1>
            </div>
          )}
          {isCollapsed && (
            <img 
              src={logoImage} 
              alt="Grindfy Logo" 
              className="w-8 h-8 flex-shrink-0"
            />
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
                {user?.name || user?.username || user?.firstName || user?.userPlatformId || 'Usuário'}
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
                            <div className="flex items-center justify-between flex-1">
                              <span className="font-medium">{item.label}</span>
                              {item.hasPro && <ProTag className="ml-2" />}
                            </div>
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
        <Link href="/subscriptions">
          <a className={`
            flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
            ${location === '/subscriptions' 
              ? 'bg-green-600/20 text-green-400 border-l-2 border-green-400' 
              : 'text-gray-300 hover:bg-green-600/10 hover:text-green-400'
            }
          `}>
            <CreditCard size={20} className={`flex-shrink-0 ${location === '/subscriptions' ? 'text-green-400' : 'text-gray-400'}`} />
            {!isCollapsed && (
              <span className="font-medium">Assinatura</span>
            )}
          </a>
        </Link>
        
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
        
        {/* Feedback Modals */}
        <div className="space-y-2">
          <BugReportModal 
            currentPage={location}
            trigger={
              <button className={`
                flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
                text-gray-300 hover:bg-red-600/20 hover:text-red-400 w-full
              `}>
                <Bug size={20} className="flex-shrink-0" />
                {!isCollapsed && (
                  <span className="font-medium">Reportar Bug</span>
                )}
              </button>
            }
          />
          
          <ImprovementSuggestionModal 
            currentPage={location}
            trigger={
              <button className={`
                flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200
                text-gray-300 hover:bg-green-600/20 hover:text-green-400 w-full
              `}>
                <Lightbulb size={20} className="flex-shrink-0" />
                {!isCollapsed && (
                  <span className="font-medium">Sugerir Melhoria</span>
                )}
              </button>
            }
          />
        </div>
        
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