// TESTE SISTEMÁTICO COMPLETO DO SISTEMA DE PERMISSÕES

// Simulação completa do sistema real
const TAGS = {
  GRADE: 'Grade',
  GRIND: 'Grind',
  DASHBOARD: 'Dashboard',
  IMPORT: 'Import',
  WARM_UP: 'Warm Up',
  CALENDARIO: 'Calendario',
  ESTUDOS: 'Estudos',
  BIBLIOTECA: 'Biblioteca',
  ANALYTICS: 'Analytics',
  USUARIOS: 'Usuarios',
  BUGS: 'Bugs',
  ADMIN_FULL: 'Admin Full'
};

const SUBSCRIPTION_PROFILES = {
  basico: {
    name: 'Básico',
    tags: [TAGS.GRADE, TAGS.GRIND],
    pages: ['grade-planner', 'grind-session']
  },
  premium: {
    name: 'Premium',
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT],
    pages: ['grade-planner', 'grind-session', 'dashboard', 'upload-history']
  },
  pro: {
    name: 'Pro',
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT, TAGS.WARM_UP, TAGS.CALENDARIO, TAGS.ESTUDOS, TAGS.BIBLIOTECA],
    pages: ['grade-planner', 'grind-session', 'dashboard', 'upload-history', 'mental-prep', 'planner', 'estudos', 'biblioteca']
  },
  admin: {
    name: 'Admin',
    tags: [TAGS.GRADE, TAGS.GRIND, TAGS.DASHBOARD, TAGS.IMPORT, TAGS.WARM_UP, TAGS.CALENDARIO, TAGS.ESTUDOS, TAGS.BIBLIOTECA, TAGS.ANALYTICS, TAGS.USUARIOS, TAGS.BUGS],
    pages: ['grade-planner', 'grind-session', 'dashboard', 'upload-history', 'mental-prep', 'planner', 'estudos', 'biblioteca', 'analytics', 'admin-users', 'admin-bugs']
  }
};

const SUPER_ADMIN_EMAIL = 'ricardo.agnolo@hotmail.com';

function isSuperAdmin(userEmail) {
  return userEmail === SUPER_ADMIN_EMAIL;
}

function hasPageAccess(subscriptionPlan, pageName, userEmail) {
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    return true;
  }
  
  // 🔧 CORREÇÃO CRÍTICA: Remover barra inicial se existir
  const cleanPageName = pageName.replace(/^\//, '').split('?')[0];
  
  // Mapeamento de páginas para tags
  const pageToTag = {
    'grade-planner': TAGS.GRADE,
    'grind-session': TAGS.GRIND,
    'dashboard': TAGS.DASHBOARD,
    'upload-history': TAGS.IMPORT,
    'mental-prep': TAGS.WARM_UP,
    'planner': TAGS.CALENDARIO,
    'estudos': TAGS.ESTUDOS,
    'biblioteca': TAGS.BIBLIOTECA,
    'tournament-library': TAGS.BIBLIOTECA,
    'analytics': TAGS.ANALYTICS,
    'admin-users': TAGS.USUARIOS,
    'admin-bugs': TAGS.BUGS,
  };
  
  const requiredTag = pageToTag[cleanPageName];
  if (!requiredTag) {
    return false;
  }
  
  const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
  if (!profile) {
    return false;
  }
  
  return profile.tags.includes(requiredTag);
}

function hasRouteAccess(subscriptionPlan, route, userEmail) {
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    return true;
  }
  
  // Remove leading slash and query parameters
  const cleanRoute = route.replace(/^\//, '').split('?')[0];
  
  // Map routes to page names 
  const routeToPage = {
    'dashboard': 'dashboard',
    'biblioteca': 'biblioteca',
    'tournament-library': 'biblioteca',
    'upload-history': 'upload-history',
    'upload': 'upload-history',
    'analytics': 'analytics',
    'grind': 'grind-session',
    'grind-live': 'grind-session',
    'grind-session': 'grind-session',
    'coach': 'grade-planner',
    'grade-planner': 'grade-planner',
    'mental': 'mental-prep',
    'mental-prep': 'mental-prep',
    'estudos': 'estudos',
    'studies': 'estudos',
    'planner': 'planner',
    'admin/users': 'admin-users',
    'admin/bugs': 'admin-bugs',
    'admin-users': 'admin-users',
    'admin-bugs': 'admin-bugs',
  };
  
  const pageName = routeToPage[cleanRoute] || cleanRoute;
  return hasPageAccess(subscriptionPlan, pageName, userEmail);
}

// TESTE REAL DO PROBLEMA
async function fazerLogin(usuario) {
  console.log(`\n🔐 SIMULANDO LOGIN: ${usuario.email}`);
  
  // Simulação de dados que vem do backend
  const dadosBackend = {
    userPlatformId: usuario.id,
    email: usuario.email,
    username: usuario.username,
    subscriptionPlan: usuario.plan,
    permissions: []
  };
  
  console.log(`📋 Dados do usuário carregados:`, dadosBackend);
  return dadosBackend;
}

async function testarAcessoPagina(token, pagina) {
  console.log(`\n🔍 TESTANDO ACESSO: ${pagina}`);
  console.log(`📋 Plano do usuário: ${token.subscriptionPlan}`);
  console.log(`📧 Email do usuário: ${token.email}`);
  
  // Teste hasRouteAccess (usado no ProtectedRoute)
  const routeAccess = hasRouteAccess(token.subscriptionPlan, pagina, token.email);
  console.log(`🛡️  hasRouteAccess('${token.subscriptionPlan}', '${pagina}', '${token.email}'): ${routeAccess}`);
  
  // Teste hasPageAccess (usado diretamente)
  const pageAccess = hasPageAccess(token.subscriptionPlan, pagina, token.email);
  console.log(`🛡️  hasPageAccess('${token.subscriptionPlan}', '${pagina}', '${token.email}'): ${pageAccess}`);
  
  return { routeAccess, pageAccess };
}

async function executarTestesCompletos() {
  console.log('🚨 EXECUTANDO TESTES COMPLETOS DO SISTEMA');
  
  // Usuários de teste
  const usuarios = [
    { id: 'USER-0002', email: 'ricardinho2012@gmail.com', username: 'ricardinho', plan: 'basico' },
    { id: 'USER-0003', email: 'laisag97@hotmail.com', username: 'laisag', plan: 'pro' },
    { id: 'USER-0001', email: 'ricardo.agnolo@hotmail.com', username: 'Docari', plan: 'admin' }
  ];
  
  // Páginas de teste
  const paginas = [
    '/grade-planner',
    '/grind-session',
    '/dashboard',
    '/upload-history',
    '/mental-prep',
    '/planner',
    '/estudos',
    '/biblioteca',
    '/analytics'
  ];
  
  for (const usuario of usuarios) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`TESTANDO USUÁRIO: ${usuario.email} (${usuario.plan})`);
    console.log(`${'='.repeat(50)}`);
    
    // Fazer login
    const token = await fazerLogin(usuario);
    
    let acessosPermitidos = 0;
    let acessosNegados = 0;
    
    // Testar cada página
    for (const pagina of paginas) {
      const resultado = await testarAcessoPagina(token, pagina);
      
      if (resultado.routeAccess) {
        acessosPermitidos++;
        console.log(`✅ ${pagina}: PERMITIDO`);
      } else {
        acessosNegados++;
        console.log(`❌ ${pagina}: NEGADO`);
      }
      
      // Verificar consistência
      if (resultado.routeAccess !== resultado.pageAccess) {
        console.log(`🚨 INCONSISTÊNCIA DETECTADA: route=${resultado.routeAccess}, page=${resultado.pageAccess}`);
      }
    }
    
    console.log(`\n📊 RESUMO: ${acessosPermitidos} permitidos, ${acessosNegados} negados`);
    
    // Verificar expectativas
    const expectativas = {
      'basico': 2,
      'premium': 4,
      'pro': 8,
      'admin': 9
    };
    
    const esperado = expectativas[usuario.plan] || 0;
    console.log(`📋 Esperado: ${esperado}, Obtido: ${acessosPermitidos}`);
    
    if (acessosPermitidos >= esperado) {
      console.log(`✅ RESULTADO CORRETO`);
    } else {
      console.log(`❌ RESULTADO INCORRETO - BUG DETECTADO!`);
    }
  }
  
  console.log('\n🎯 TESTES COMPLETOS FINALIZADOS');
}

// Executar os testes
executarTestesCompletos();