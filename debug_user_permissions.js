// DEBUG: Verificação específica do problema de permissões USER-0003
import { SUBSCRIPTION_PROFILES, TAGS, hasPageAccess } from './shared/permissions.ts';

console.log('🔍 DIAGNÓSTICO DETALHADO DO PROBLEMA DE PERMISSÕES');
console.log('==========================================');

// Teste do plano pro
console.log('\n📋 PLANO PRO CONFIGURADO:');
console.log('Nome:', SUBSCRIPTION_PROFILES.pro.name);
console.log('Tags:', SUBSCRIPTION_PROFILES.pro.tags);
console.log('Páginas:', SUBSCRIPTION_PROFILES.pro.pages);
console.log('Quantidade de tags:', SUBSCRIPTION_PROFILES.pro.tags.length);

// Teste das tags
console.log('\n🏷️ TAGS DEFINIDAS:');
Object.entries(TAGS).forEach(([key, value]) => {
  console.log(`${key}: ${value}`);
});

// Teste da função hasPageAccess
console.log('\n🛡️ TESTANDO hasPageAccess PARA USER-0003:');

const testPages = [
  'grade-planner',
  'grind-session', 
  'dashboard',
  'upload-history',
  'mental-prep',
  'planner',
  'estudos',
  'biblioteca',
  'analytics'
];

testPages.forEach(page => {
  const result = hasPageAccess('pro', page, 'laisag97@hotmail.com');
  console.log(`${page}: ${result ? 'PERMITIDO' : 'NEGADO'}`);
});

console.log('\n🔍 RESULTADO ESPERADO PARA PLANO PRO:');
console.log('- grade-planner: PERMITIDO');
console.log('- grind-session: PERMITIDO');
console.log('- dashboard: PERMITIDO');
console.log('- upload-history: PERMITIDO');
console.log('- mental-prep: PERMITIDO');
console.log('- planner: PERMITIDO');
console.log('- estudos: PERMITIDO');
console.log('- biblioteca: PERMITIDO');
console.log('- analytics: NEGADO (apenas admin)');