import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import BugReportModal from '@/components/BugReportModal';
import ImprovementSuggestionModal from '@/components/ImprovementSuggestionModal';
import logoImage from '@assets/image_1753377238747.webp';
import { getTrialDaysRemaining, getSubscriptionStatus, isSuperAdmin } from '../../../shared/permissions';
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
  const { user, logout, isAdmin } = useAuth();

  const menuSections = [
    {
      title: 'VISAO GERAL',
      items: [
        { path: '/', icon: User, label: 'Home', adminOnly: false },
        { path: '/dashboard', icon: BarChart3, label: 'Dashboard', adminOnly: false },
        { path: '/upload', icon: Upload, label: 'Import', adminOnly: false },
        { path: '/library', icon: BookOpen, label: 'Biblioteca', adminOnly: false },
      ]
    },
    {
      title: 'GRIND',
      items: [
        { path: '/coach', icon: Calendar, label: 'Grade', adminOnly: false },
        { path: '/grind', icon: Gamepad2, label: 'Grind', adminOnly: false },
        { path: '/mental', icon: Brain, label: 'Warm Up', adminOnly: false },
      ]
    },
    {
      title: 'FERRAMENTAS',
      items: [
        { path: '/estudos', icon: BookOpen, label: 'Estudos', adminOnly: false },
        { path: '/calculadoras', icon: Wrench, label: 'Ferramentas', adminOnly: false },
      ]
    },
    {
      title: 'ADMIN',
      items: [
        { path: '/analytics', icon: TrendingUp, label: 'Analytics', adminOnly: true },
        { path: '/admin/users', icon: Users, label: 'Usuarios', adminOnly: true },
        { path: '/admin/bugs', icon: Bug, label: 'Bugs', adminOnly: true },
      ]
    }
  ];

  // Filter: admin items only shown to admins
  const filteredMenuSections = menuSections.map(section => ({
    ...section,
    items: section.items.filter(item => !item.adminOnly || isAdmin)
  })).filter(section => section.items.length > 0);

  const handleLogout = async () => {
    await logout();
  };

  // Subscription status badge
  const renderSubscriptionBadge = () => {
    if (!user) return null;
    if (isSuperAdmin(user.email)) return null;

    const status = getSubscriptionStatus(user);

    if (status === 'trial') {
      const daysLeft = getTrialDaysRemaining(user.trialEndsAt);
      return (
        <Link href="/subscriptions">
          <a className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition-colors">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {isCollapsed ? `${daysLeft}d` : `Trial - ${daysLeft} dias`}
          </a>
        </Link>
      );
    }

    if (status === 'active') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          {isCollapsed ? '' : 'Assinante'}
        </div>
      );
    }

    // expired
    return (
      <Link href="/subscriptions">
        <a className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          {isCollapsed ? '!' : 'Assine agora'}
        </a>
      </Link>
    );
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
                {user?.name || user?.username || user?.firstName || user?.userPlatformId || 'Usuario'}
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
        {/* Subscription Status Badge */}
        {renderSubscriptionBadge()}

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
              <span className="font-medium">Configuracoes</span>
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
