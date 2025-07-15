import { useAuth } from "@/contexts/AuthContext";
import { hasPageAccess, hasTagAccess, SUBSCRIPTION_PROFILES, TAGS } from "@shared/permissions";

export default function PermissionTestComponent() {
  const { user } = useAuth();

  if (!user) {
    return <div>Usuário não autenticado</div>;
  }

  const testPages = [
    { name: 'Grade Planner', route: 'grade-planner', tag: TAGS.GRADE },
    { name: 'Grind Session', route: 'grind-session', tag: TAGS.GRIND },
    { name: 'Dashboard', route: 'dashboard', tag: TAGS.DASHBOARD },
    { name: 'Upload History', route: 'upload-history', tag: TAGS.IMPORT },
    { name: 'Mental Prep', route: 'mental-prep', tag: TAGS.WARM_UP },
    { name: 'Planner', route: 'planner', tag: TAGS.CALENDARIO },
    { name: 'Estudos', route: 'estudos', tag: TAGS.ESTUDOS },
    { name: 'Biblioteca', route: 'biblioteca', tag: TAGS.BIBLIOTECA },
    { name: 'Analytics', route: 'analytics', tag: TAGS.ANALYTICS },
    { name: 'Admin Users', route: 'admin-users', tag: TAGS.USUARIOS },
    { name: 'Admin Bugs', route: 'admin-bugs', tag: TAGS.BUGS },
  ];

  const userProfile = SUBSCRIPTION_PROFILES[user.subscriptionPlan];

  // Funções de debug para logs detalhados
  const debugPermissions = () => {
    console.log('🔍 DEBUG DETALHADO DO USUÁRIO:', {
      email: user.email,
      subscriptionPlan: user.subscriptionPlan,
      userPlatformId: user.userPlatformId,
      permissions: user.permissions
    });
    
    console.log('🔍 PERFIL DO PLANO:', userProfile);
    
    testPages.forEach(page => {
      const hasAccess = hasPageAccess(user.subscriptionPlan, page.route, user.email);
      const hasTag = hasTagAccess(user.subscriptionPlan, page.tag, user.email);
      
      console.log(`🔍 ${page.name}:`, {
        route: page.route,
        tag: page.tag,
        hasAccess,
        hasTag,
        expectedTags: userProfile?.tags || []
      });
    });
  };

  // Executar debug ao carregar componente
  debugPermissions();

  // Verificar se é super admin
  const isSuperAdmin = user.email === 'ricardo.agnolo@hotmail.com';

  return (
    <div className="min-h-screen bg-poker-bg p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-poker-gold mb-8">
          🔍 Auditoria Completa do Sistema de Permissões
        </h1>

        {/* Informações do usuário */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            Informações do Usuário
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-300">Email:</span>
              <span className="text-white ml-2">{user.email}</span>
            </div>
            <div>
              <span className="text-gray-300">Plano:</span>
              <span className="text-white ml-2">{user.subscriptionPlan}</span>
            </div>
            <div>
              <span className="text-gray-300">User Platform ID:</span>
              <span className="text-white ml-2">{user.userPlatformId}</span>
            </div>
            <div>
              <span className="text-gray-300">Permissões:</span>
              <span className="text-white ml-2">{user.permissions?.length || 0}</span>
            </div>
            <div>
              <span className="text-gray-300">Super Admin:</span>
              <span className={`ml-2 px-2 py-1 rounded text-xs ${
                isSuperAdmin ? 'bg-yellow-600 text-black' : 'bg-gray-600 text-white'
              }`}>
                {isSuperAdmin ? 'SIM' : 'NÃO'}
              </span>
            </div>
          </div>
        </div>

        {/* Perfil do plano */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            Perfil do Plano: {userProfile?.name || 'Desconhecido'}
          </h2>
          <div className="text-sm text-gray-300 mb-4">
            {userProfile?.description || 'Sem descrição'}
          </div>
          <div className="text-sm">
            <span className="text-gray-300">Tags do plano ({userProfile?.tags?.length || 0}):</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {userProfile?.tags?.map(tag => (
                <span key={tag} className="px-2 py-1 bg-poker-gold text-black rounded text-xs">
                  {tag}
                </span>
              )) || <span className="text-red-400">Nenhuma tag encontrada</span>}
            </div>
          </div>
        </div>

        {/* Teste de acesso às páginas */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Teste de Acesso às Páginas (11 páginas)
          </h2>
          <div className="space-y-3">
            {testPages.map(page => {
              const hasAccess = hasPageAccess(user.subscriptionPlan, page.route, user.email);
              const hasTag = hasTagAccess(user.subscriptionPlan, page.tag, user.email);
              
              return (
                <div key={page.route} className="flex items-center justify-between p-3 bg-gray-700 rounded">
                  <div className="flex items-center space-x-3">
                    <span className="text-white font-medium">{page.name}</span>
                    <span className="text-gray-400 text-sm">({page.route})</span>
                    <span className="text-gray-500 text-xs">Tag: {page.tag}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      hasAccess 
                        ? 'bg-green-600 text-white' 
                        : 'bg-red-600 text-white'
                    }`}>
                      {hasAccess ? 'PERMITIDO' : 'NEGADO'}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      hasTag 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-600 text-white'
                    }`}>
                      Tag: {hasTag ? 'OK' : 'NO'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Verificação de hierarquia */}
        <div className="bg-gray-800 rounded-lg p-6 mt-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            Verificação de Hierarquia
          </h2>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="bg-gray-700 p-4 rounded">
              <div className="text-sm text-gray-300">BÁSICO</div>
              <div className="text-lg font-bold text-white">2 acessos</div>
              <div className="text-xs text-gray-400">Grade + Grind</div>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <div className="text-sm text-gray-300">PREMIUM</div>
              <div className="text-lg font-bold text-white">4 acessos</div>
              <div className="text-xs text-gray-400">+ Dashboard + Import</div>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <div className="text-sm text-gray-300">PRO</div>
              <div className="text-lg font-bold text-white">8 acessos</div>
              <div className="text-xs text-gray-400">+ 4 funcionalidades</div>
            </div>
            <div className="bg-gray-700 p-4 rounded">
              <div className="text-sm text-gray-300">ADMIN</div>
              <div className="text-lg font-bold text-white">11 acessos</div>
              <div className="text-xs text-gray-400">+ Analytics + Users + Bugs</div>
            </div>
          </div>
        </div>

        {/* Resumo */}
        <div className="bg-gray-800 rounded-lg p-6 mt-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            Resumo dos Testes
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-300">Total de páginas testadas:</span>
              <span className="text-white ml-2">{testPages.length}</span>
            </div>
            <div>
              <span className="text-gray-300">Acessos permitidos:</span>
              <span className="text-white ml-2">
                {testPages.filter(page => hasPageAccess(user.subscriptionPlan, page.route, user.email)).length}
              </span>
            </div>
            <div>
              <span className="text-gray-300">Acessos negados:</span>
              <span className="text-white ml-2">
                {testPages.filter(page => !hasPageAccess(user.subscriptionPlan, page.route, user.email)).length}
              </span>
            </div>
            <div>
              <span className="text-gray-300">Tags disponíveis:</span>
              <span className="text-white ml-2">{userProfile?.tags?.length || 0}</span>
            </div>
          </div>
          
          {/* Status do sistema */}
          <div className="mt-4 p-3 rounded bg-gray-700">
            <div className="text-sm text-gray-300">Status do Sistema:</div>
            <div className={`text-lg font-bold ${
              testPages.filter(page => hasPageAccess(user.subscriptionPlan, page.route, user.email)).length > 0
                ? 'text-green-400' 
                : 'text-red-400'
            }`}>
              {testPages.filter(page => hasPageAccess(user.subscriptionPlan, page.route, user.email)).length > 0
                ? '✅ SISTEMA FUNCIONANDO'
                : '❌ SISTEMA COM PROBLEMAS'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}