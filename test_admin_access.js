// Teste específico para verificar acesso do usuário admin
import { hasTagAccess, getPlanDisplayName, isSuperAdmin, getUserTags } from './shared/permissions.js';

// Dados do usuário admin
const adminUser = {
  subscriptionPlan: 'admin',
  email: 'laisag97@hotmail.com'
};

console.log("🔍 TESTE ADMIN ACCESS");
console.log("Dados do usuário:", adminUser);
console.log("É super-admin?", isSuperAdmin(adminUser.email));

// Teste Dashboard
console.log("\n🔍 TESTE DASHBOARD ACCESS");
const dashboardAccess = hasTagAccess(adminUser.subscriptionPlan, 'Dashboard', adminUser.email);
console.log("Dashboard access:", dashboardAccess);

// Teste Import
console.log("\n🔍 TESTE IMPORT ACCESS");
const importAccess = hasTagAccess(adminUser.subscriptionPlan, 'Import', adminUser.email);
console.log("Import access:", importAccess);

// Teste nome do plano
console.log("\n🔍 TESTE PLAN NAME");
const planName = getPlanDisplayName(adminUser.subscriptionPlan);
console.log("Plan name:", planName);

// Teste tags do usuário
const userTags = getUserTags(adminUser.subscriptionPlan);
console.log("Tags do usuário:", userTags);