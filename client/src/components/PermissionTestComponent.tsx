import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasTagAccess, hasPageAccess, TAGS } from '../../../shared/permissions';

const PermissionTestComponent: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return <div>Usuário não autenticado</div>;
  }

  const testPermissions = [
    { name: 'Grade', tag: TAGS.GRADE },
    { name: 'Grind', tag: TAGS.GRIND },
    { name: 'Dashboard', tag: TAGS.DASHBOARD },
    { name: 'Import', tag: TAGS.IMPORT },
    { name: 'Warm Up', tag: TAGS.WARM_UP },
    { name: 'Calendario', tag: TAGS.CALENDARIO },
    { name: 'Estudos', tag: TAGS.ESTUDOS },
    { name: 'Biblioteca', tag: TAGS.BIBLIOTECA },
    { name: 'Analytics', tag: TAGS.ANALYTICS },
    { name: 'Usuarios', tag: TAGS.USUARIOS },
    { name: 'Bugs', tag: TAGS.BUGS },
  ];

  const testPages = [
    { name: 'Grade Planner', page: 'grade-planner' },
    { name: 'Grind Session', page: 'grind-session' },
    { name: 'Dashboard', page: 'dashboard' },
    { name: 'Upload History', page: 'upload-history' },
    { name: 'Mental Prep', page: 'mental-prep' },
    { name: 'Planner', page: 'planner' },
    { name: 'Estudos', page: 'estudos' },
    { name: 'Biblioteca', page: 'biblioteca' },
    { name: 'Analytics', page: 'analytics' },
    { name: 'Admin Users', page: 'admin-users' },
    { name: 'Admin Bugs', page: 'admin-bugs' },
  ];

  return (
    <div className="p-6 bg-gray-900 text-white rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Teste de Permissões</h2>
      
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Informações do Usuário</h3>
        <div className="bg-gray-800 p-4 rounded">
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Plano:</strong> {user.subscriptionPlan}</p>
          <p><strong>Super Admin:</strong> {user.email === 'ricardo.agnolo@hotmail.com' ? 'Sim' : 'Não'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Permissões por Tag</h3>
          <div className="space-y-2">
            {testPermissions.map(({ name, tag }) => {
              const hasAccess = hasTagAccess(user.subscriptionPlan, tag, user.email);
              return (
                <div key={name} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                  <span>{name}</span>
                  <span className={`px-2 py-1 rounded text-sm ${hasAccess ? 'bg-green-600' : 'bg-red-600'}`}>
                    {hasAccess ? '✅ Permitido' : '❌ Negado'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Permissões por Página</h3>
          <div className="space-y-2">
            {testPages.map(({ name, page }) => {
              const hasAccess = hasPageAccess(user.subscriptionPlan, page, user.email);
              return (
                <div key={name} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                  <span>{name}</span>
                  <span className={`px-2 py-1 rounded text-sm ${hasAccess ? 'bg-green-600' : 'bg-red-600'}`}>
                    {hasAccess ? '✅ Permitido' : '❌ Negado'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionTestComponent;