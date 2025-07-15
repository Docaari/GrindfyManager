import { TAGS, SUBSCRIPTION_PROFILES, getUserTags, hasTagAccess, getPlanDisplayName } from './shared/permissions.ts';

console.log("🔍 DEBUGGING SISTEMA DE PERMISSÕES");
console.log("=".repeat(50));

// Teste completo do usuário Premium
console.log("\n📋 TESTE DO USUÁRIO PREMIUM (laisag97@hotmail.com):");
console.log("Database subscription_plan: premium");

// 1. Verificar se o profile existe
console.log("\n1. VERIFICANDO PROFILE PREMIUM:");
const premiumProfile = SUBSCRIPTION_PROFILES['premium'];
console.log("SUBSCRIPTION_PROFILES['premium']:", premiumProfile);

// 2. Verificar função getUserTags
console.log("\n2. TESTANDO getUserTags:");
const userTags = getUserTags('premium');
console.log("getUserTags('premium'):", userTags);

// 3. Verificar getPlanDisplayName
console.log("\n3. TESTANDO getPlanDisplayName:");
const displayName = getPlanDisplayName('premium');
console.log("getPlanDisplayName('premium'):", displayName);

// 4. Verificar hasTagAccess para cada tag que deveria ter
console.log("\n4. TESTANDO hasTagAccess para tags que Premium deveria ter:");
const expectedTags = ['Grade', 'Grind', 'Dashboard', 'Import'];
expectedTags.forEach(tag => {
  const hasAccess = hasTagAccess('premium', tag, 'laisag97@hotmail.com');
  console.log(`hasTagAccess('premium', '${tag}', 'laisag97@hotmail.com'):`, hasAccess);
});

// 5. Verificar se as tags estão definidas corretamente
console.log("\n5. VERIFICANDO DEFINIÇÕES DE TAGS:");
console.log("TAGS.GRADE:", TAGS.GRADE);
console.log("TAGS.GRIND:", TAGS.GRIND);
console.log("TAGS.DASHBOARD:", TAGS.DASHBOARD);
console.log("TAGS.IMPORT:", TAGS.IMPORT);

// 6. Verificar o que deveria estar no perfil premium
console.log("\n6. VERIFICANDO O QUE DEVERIA ESTAR NO PERFIL PREMIUM:");
console.log("Tags esperadas: ['Grade', 'Grind', 'Dashboard', 'Import']");
console.log("Tags no perfil premium:", premiumProfile ? premiumProfile.tags : 'PERFIL NÃO ENCONTRADO');

// 7. Verificar problema de case sensitivity
console.log("\n7. VERIFICANDO CASE SENSITIVITY:");
console.log("Chaves do SUBSCRIPTION_PROFILES:", Object.keys(SUBSCRIPTION_PROFILES));
console.log("Tem 'premium'?", SUBSCRIPTION_PROFILES.hasOwnProperty('premium'));

// 8. Teste com todas as keys
console.log("\n8. TESTANDO TODAS AS KEYS:");
Object.keys(SUBSCRIPTION_PROFILES).forEach(key => {
  console.log(`${key}: ${SUBSCRIPTION_PROFILES[key].name} (${SUBSCRIPTION_PROFILES[key].tags.length} tags)`);
});