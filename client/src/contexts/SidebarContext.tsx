import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';

interface SidebarContextType {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
  autoCollapseForGrind: boolean;
  setAutoCollapseForGrind: (autoCollapse: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

interface SidebarProviderProps {
  children: ReactNode;
}

export function SidebarProvider({ children }: SidebarProviderProps) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Recuperar estado do localStorage
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const [autoCollapseForGrind, setAutoCollapseForGrind] = useState(() => {
    const saved = localStorage.getItem('sidebar-auto-collapse-grind');
    return saved ? JSON.parse(saved) : true; // Padrão ativo
  });

  const [previousState, setPreviousState] = useState<boolean | null>(null);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const setCollapsed = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
  };

  // Auto-colapso para sessões de grind
  useEffect(() => {
    if (autoCollapseForGrind) {
      if (location === '/grind-live') {
        // Salvar estado anterior antes de colapsar
        if (previousState === null) {
          setPreviousState(isCollapsed);
        }
        if (!isCollapsed) {
          setIsCollapsed(true);
        }
      } else if (previousState !== null) {
        // Restaurar estado anterior ao sair da sessão
        setIsCollapsed(previousState);
        setPreviousState(null);
      }
    }
  }, [location, autoCollapseForGrind, isCollapsed, previousState]);

  // Salvar estado no localStorage
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    localStorage.setItem('sidebar-auto-collapse-grind', JSON.stringify(autoCollapseForGrind));
  }, [autoCollapseForGrind]);

  return (
    <SidebarContext.Provider value={{ 
      isCollapsed, 
      toggleSidebar, 
      setCollapsed, 
      autoCollapseForGrind, 
      setAutoCollapseForGrind 
    }}>
      {children}
    </SidebarContext.Provider>
  );
}