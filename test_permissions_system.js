// Teste do sistema de permissões
import { hasTagAccess, hasPageAccess, TAGS, SUBSCRIPTION_PROFILES } from './shared/permissions.js';

// Teste 1: Usuário Básico
console.log("=== TESTE 1: USUÁRIO BÁSICO ===");
console.log("Plano: basico");
console.log("Tags disponíveis:", SUBSCRIPTION_PROFILES.basico.tags);
console.log("✅ Grade:", hasTagAccess('basico', TAGS.GRADE));
console.log("✅ Grind:", hasTagAccess('basico', TAGS.GRIND));
console.log("❌ Dashboard:", hasTagAccess('basico', TAGS.DASHBOARD));
console.log("❌ Import:", hasTagAccess('basico', TAGS.IMPORT));
console.log("❌ Warm Up:", hasTagAccess('basico', TAGS.WARM_UP));
console.log("❌ Analytics:", hasTagAccess('basico', TAGS.ANALYTICS));

// Teste 2: Usuário Premium
console.log("\n=== TESTE 2: USUÁRIO PREMIUM ===");
console.log("Plano: premium");
console.log("Tags disponíveis:", SUBSCRIPTION_PROFILES.premium.tags);
console.log("✅ Grade:", hasTagAccess('premium', TAGS.GRADE));
console.log("✅ Grind:", hasTagAccess('premium', TAGS.GRIND));
console.log("✅ Dashboard:", hasTagAccess('premium', TAGS.DASHBOARD));
console.log("✅ Import:", hasTagAccess('premium', TAGS.IMPORT));
console.log("❌ Warm Up:", hasTagAccess('premium', TAGS.WARM_UP));
console.log("❌ Analytics:", hasTagAccess('premium', TAGS.ANALYTICS));

// Teste 3: Usuário Pro
console.log("\n=== TESTE 3: USUÁRIO PRO ===");
console.log("Plano: pro");
console.log("Tags disponíveis:", SUBSCRIPTION_PROFILES.pro.tags);
console.log("✅ Grade:", hasTagAccess('pro', TAGS.GRADE));
console.log("✅ Grind:", hasTagAccess('pro', TAGS.GRIND));
console.log("✅ Dashboard:", hasTagAccess('pro', TAGS.DASHBOARD));
console.log("✅ Import:", hasTagAccess('pro', TAGS.IMPORT));
console.log("✅ Warm Up:", hasTagAccess('pro', TAGS.WARM_UP));
console.log("✅ Calendario:", hasTagAccess('pro', TAGS.CALENDARIO));
console.log("✅ Estudos:", hasTagAccess('pro', TAGS.ESTUDOS));
console.log("✅ Biblioteca:", hasTagAccess('pro', TAGS.BIBLIOTECA));
console.log("❌ Analytics:", hasTagAccess('pro', TAGS.ANALYTICS));

// Teste 4: Usuário Admin
console.log("\n=== TESTE 4: USUÁRIO ADMIN ===");
console.log("Plano: admin");
console.log("Tags disponíveis:", SUBSCRIPTION_PROFILES.admin.tags);
console.log("✅ Grade:", hasTagAccess('admin', TAGS.GRADE));
console.log("✅ Grind:", hasTagAccess('admin', TAGS.GRIND));
console.log("✅ Dashboard:", hasTagAccess('admin', TAGS.DASHBOARD));
console.log("✅ Import:", hasTagAccess('admin', TAGS.IMPORT));
console.log("✅ Warm Up:", hasTagAccess('admin', TAGS.WARM_UP));
console.log("✅ Calendario:", hasTagAccess('admin', TAGS.CALENDARIO));
console.log("✅ Estudos:", hasTagAccess('admin', TAGS.ESTUDOS));
console.log("✅ Biblioteca:", hasTagAccess('admin', TAGS.BIBLIOTECA));
console.log("✅ Analytics:", hasTagAccess('admin', TAGS.ANALYTICS));
console.log("✅ Usuarios:", hasTagAccess('admin', TAGS.USUARIOS));
console.log("✅ Bugs:", hasTagAccess('admin', TAGS.BUGS));

// Teste 5: Super Admin (ricardo.agnolo@hotmail.com)
console.log("\n=== TESTE 5: SUPER ADMIN ===");
console.log("✅ Acesso total (independente do plano):", hasTagAccess('basico', TAGS.ANALYTICS, 'ricardo.agnolo@hotmail.com'));

// Teste 6: Páginas
console.log("\n=== TESTE 6: ACESSO A PÁGINAS ===");
console.log("Básico - grade-planner:", hasPageAccess('basico', 'grade-planner'));
console.log("Básico - dashboard:", hasPageAccess('basico', 'dashboard'));
console.log("Premium - dashboard:", hasPageAccess('premium', 'dashboard'));
console.log("Premium - upload-history:", hasPageAccess('premium', 'upload-history'));
console.log("Pro - mental-prep:", hasPageAccess('pro', 'mental-prep'));
console.log("Admin - admin-users:", hasPageAccess('admin', 'admin-users'));