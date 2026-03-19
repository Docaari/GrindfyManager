import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasPageAccess, hasRouteAccess, SUBSCRIPTION_PROFILES } from '../../../shared/permissions';

const PermissionTestComponent = () => {
  const { user } = useAuth();
  
  if (!user) {
    return <div>Usuário não autenticado</div>;
  }

  const testPages = [
    { route: '/grade-planner', name: 'Grade Planner' },
    { route: '/grind-session', name: 'Grind Session' },
    { route: '/dashboard', name: 'Dashboard' },
    { route: '/upload-history', name: 'Upload History' },
    { route: '/mental-prep', name: 'Mental Prep' },
    { route: '/estudos', name: 'Estudos' },
    { route: '/biblioteca', name: 'Biblioteca' },
    { route: '/analytics', name: 'Analytics' },
  ];

  const userPlan = user.subscriptionPlan;
  const profile = SUBSCRIPTION_PROFILES[userPlan];

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', margin: '20px', borderRadius: '8px' }}>
      <h2 style={{ color: '#333', marginBottom: '20px' }}>🔍 TESTE DE PERMISSÕES</h2>
      
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#e8f4f8', borderRadius: '4px' }}>
        <h3>📋 Informações do Usuário</h3>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Plano:</strong> {userPlan} ({profile?.name})</p>
        <p><strong>Tags do Plano:</strong> {profile?.tags?.join(', ')}</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>🛡️ Teste de Acesso por Página</h3>
        {testPages.map(page => {
          const routeAccess = hasRouteAccess(userPlan, page.route, user.email);
          const pageAccess = hasPageAccess(userPlan, page.route, user.email);
          
          return (
            <div key={page.route} style={{ 
              padding: '10px', 
              margin: '5px 0', 
              backgroundColor: routeAccess ? '#e8f5e8' : '#fde8e8',
              borderRadius: '4px',
              border: routeAccess !== pageAccess ? '2px solid #ff0000' : '1px solid #ccc'
            }}>
              <strong>{page.name} ({page.route})</strong>
              <div style={{ marginTop: '5px' }}>
                <span style={{ color: routeAccess ? '#4CAF50' : '#f44336' }}>
                  🛡️ Route: {routeAccess ? 'PERMITIDO' : 'NEGADO'}
                </span>
                <span style={{ marginLeft: '20px', color: pageAccess ? '#4CAF50' : '#f44336' }}>
                  🛡️ Page: {pageAccess ? 'PERMITIDO' : 'NEGADO'}
                </span>
                {routeAccess !== pageAccess && (
                  <span style={{ marginLeft: '20px', color: '#ff0000', fontWeight: 'bold' }}>
                    ⚠️ INCONSISTÊNCIA!
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
        <h3>📊 Resumo</h3>
        <p><strong>Plano Atual:</strong> {userPlan}</p>
        <p><strong>Páginas Permitidas:</strong> {testPages.filter(p => hasRouteAccess(userPlan, p.route, user.email)).length}/{testPages.length}</p>
        <p><strong>Sistema Funcionando:</strong> {
          testPages.every(p => hasRouteAccess(userPlan, p.route, user.email) === hasPageAccess(userPlan, p.route, user.email)) 
            ? '✅ SIM' 
            : '❌ NÃO - Inconsistências detectadas'
        }</p>
      </div>
    </div>
  );
};

export default PermissionTestComponent;