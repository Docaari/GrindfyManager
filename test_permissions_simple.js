// Teste simples das permissões
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
    tags: ['Grade', 'Grind']
  },
  premium: {
    name: 'Premium',
    tags: ['Grade', 'Grind', 'Dashboard', 'Import']
  },
  pro: {
    name: 'Pro',
    tags: ['Grade', 'Grind', 'Dashboard', 'Import', 'Warm Up', 'Calendario', 'Estudos', 'Biblioteca']
  },
  admin: {
    name: 'Admin',
    tags: ['Grade', 'Grind', 'Dashboard', 'Import', 'Warm Up', 'Calendario', 'Estudos', 'Biblioteca', 'Analytics', 'Usuarios', 'Bugs', 'Admin Full']
  }
};

function hasTagAccess(subscriptionPlan, requiredTag, userEmail) {
  // Super-admin tem acesso total
  if (userEmail === 'ricardo.agnolo@hotmail.com') {
    return true;
  }
  
  const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
  return profile ? profile.tags.includes(requiredTag) : false;
}

// Testes
console.log('=== TESTE SISTEMA DE PERMISSÕES ===');

console.log('\n1. BÁSICO - Deve ter: Grade, Grind');
console.log('✅ Grade:', hasTagAccess('basico', TAGS.GRADE));
console.log('✅ Grind:', hasTagAccess('basico', TAGS.GRIND));
console.log('❌ Dashboard:', hasTagAccess('basico', TAGS.DASHBOARD));
console.log('❌ Import:', hasTagAccess('basico', TAGS.IMPORT));

console.log('\n2. PREMIUM - Deve ter: Grade, Grind, Dashboard, Import');
console.log('✅ Grade:', hasTagAccess('premium', TAGS.GRADE));
console.log('✅ Grind:', hasTagAccess('premium', TAGS.GRIND));
console.log('✅ Dashboard:', hasTagAccess('premium', TAGS.DASHBOARD));
console.log('✅ Import:', hasTagAccess('premium', TAGS.IMPORT));
console.log('❌ Warm Up:', hasTagAccess('premium', TAGS.WARM_UP));

console.log('\n3. PRO - Deve ter: Grade até Biblioteca');
console.log('✅ Grade:', hasTagAccess('pro', TAGS.GRADE));
console.log('✅ Grind:', hasTagAccess('pro', TAGS.GRIND));
console.log('✅ Dashboard:', hasTagAccess('pro', TAGS.DASHBOARD));
console.log('✅ Import:', hasTagAccess('pro', TAGS.IMPORT));
console.log('✅ Warm Up:', hasTagAccess('pro', TAGS.WARM_UP));
console.log('✅ Calendario:', hasTagAccess('pro', TAGS.CALENDARIO));
console.log('✅ Estudos:', hasTagAccess('pro', TAGS.ESTUDOS));
console.log('✅ Biblioteca:', hasTagAccess('pro', TAGS.BIBLIOTECA));
console.log('❌ Analytics:', hasTagAccess('pro', TAGS.ANALYTICS));

console.log('\n4. ADMIN - Deve ter: Tudo');
console.log('✅ Grade:', hasTagAccess('admin', TAGS.GRADE));
console.log('✅ Analytics:', hasTagAccess('admin', TAGS.ANALYTICS));
console.log('✅ Usuarios:', hasTagAccess('admin', TAGS.USUARIOS));
console.log('✅ Bugs:', hasTagAccess('admin', TAGS.BUGS));

console.log('\n5. SUPER ADMIN - Deve ter acesso total');
console.log('✅ Acesso total:', hasTagAccess('basico', TAGS.ANALYTICS, 'ricardo.agnolo@hotmail.com'));

console.log('\n=== TESTE CONCLUÍDO ===');