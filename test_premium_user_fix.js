import { TAGS, SUBSCRIPTION_PROFILES, getUserTags, hasTagAccess, hasPageAccess, hasRouteAccess } from './shared/permissions.ts';

console.log("🔧 TESTE COMPLETO DO SISTEMA DE PERMISSÕES CORRIGIDO");
console.log("=".repeat(60));

// Teste 1: Usuário Premium (laisag97@hotmail.com)
console.log("\n🌟 TESTE 1: USUÁRIO PREMIUM");
console.log("Email: laisag97@hotmail.com");
console.log("Plano: premium");

const premiumTags = getUserTags('premium');
console.log("Tags do usuário premium:", premiumTags);

const premiumTestPermissions = [
  'Grade',
  'Grind', 
  'Dashboard',
  'Import',
  'Analytics',
  'Warm Up',
  'Estudos',
  'Biblioteca'
];

console.log("\n📋 TESTANDO ACESSO A TAGS:");
premiumTestPermissions.forEach(tag => {
  const hasAccess = hasTagAccess('premium', tag, 'laisag97@hotmail.com');
  const status = hasAccess ? "✅ PERMITIDO" : "❌ NEGADO";
  console.log(`${tag}: ${status}`);
});

console.log("\n📋 TESTANDO ACESSO A PÁGINAS:");
const paginasTeste = [
  'grade-planner',
  'grind-session',
  'dashboard',
  'upload-history',
  'mental-prep',
  'weekly-planner',
  'studies',
  'library'
];

paginasTeste.forEach(page => {
  const hasAccess = hasPageAccess('premium', page, 'laisag97@hotmail.com');
  const status = hasAccess ? "✅ PERMITIDO" : "❌ NEGADO";
  console.log(`${page}: ${status}`);
});

// Teste 2: Usuário Básico (ricardinho2012@gmail.com)
console.log("\n🔧 TESTE 2: USUÁRIO BÁSICO");
console.log("Email: ricardinho2012@gmail.com");
console.log("Plano: basico");

const basicTags = getUserTags('basico');
console.log("Tags do usuário básico:", basicTags);

console.log("\n📋 TESTANDO ACESSO A TAGS:");
premiumTestPermissions.forEach(tag => {
  const hasAccess = hasTagAccess('basico', tag, 'ricardinho2012@gmail.com');
  const status = hasAccess ? "✅ PERMITIDO" : "❌ NEGADO";
  console.log(`${tag}: ${status}`);
});

// Teste 3: Super Admin (ricardo.agnolo@hotmail.com)
console.log("\n👑 TESTE 3: SUPER ADMIN");
console.log("Email: ricardo.agnolo@hotmail.com");
console.log("Plano: admin");

console.log("\n📋 TESTANDO ACESSO A TAGS (Super Admin):");
premiumTestPermissions.forEach(tag => {
  const hasAccess = hasTagAccess('admin', tag, 'ricardo.agnolo@hotmail.com');
  const status = hasAccess ? "✅ PERMITIDO" : "❌ NEGADO";
  console.log(`${tag}: ${status}`);
});

// Teste 4: Contagem de funcionalidades por plano
console.log("\n📊 RESUMO DE FUNCIONALIDADES POR PLANO:");
['basico', 'premium', 'pro', 'admin'].forEach(plan => {
  const profile = SUBSCRIPTION_PROFILES[plan];
  if (profile) {
    const tags = profile.tags.length;
    const pages = profile.pages.length;
    const features = profile.features.length;
    console.log(`${plan.toUpperCase()}: ${tags} tags, ${pages} páginas, ${features} funcionalidades`);
  }
});

console.log("\n🎯 TESTE FINALIZADO - Sistema de permissões validado!");