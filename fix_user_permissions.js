// SCRIPT DE CORREÇÃO CRÍTICA: Aplicar permissões corretas aos usuários
import { SUBSCRIPTION_PROFILES } from './shared/permissions.ts';
import { db } from './server/db.ts';
import { sql } from 'drizzle-orm';

async function fixUserPermissions() {
    console.log('🔧 INICIANDO CORREÇÃO DE PERMISSÕES');
    console.log('======================================');
    
    const db = await connectToDatabase();
    
    // Buscar todos os usuários
    const users = await db.execute(sql`
        SELECT id, user_platform_id, email, subscription_plan 
        FROM users 
        WHERE user_platform_id IN ('USER-0001', 'USER-0002', 'USER-0003')
    `);
    
    console.log('👥 USUÁRIOS ENCONTRADOS:', users.length);
    
    // Buscar todas as permissões disponíveis
    const permissions = await db.execute(sql`
        SELECT id, name 
        FROM permissions 
        ORDER BY name
    `);
    
    console.log('🔑 PERMISSÕES DISPONÍVEIS:', permissions.length);
    permissions.forEach(p => console.log(`  - ${p.name}`));
    
    // Mapeamento de tags para permissões do banco
    const tagToPermissionMap = {
        'Grade': 'grade_planner_access',
        'Grind': 'grind_access',
        'Dashboard': 'dashboard_access',
        'Import': 'upload_access',
        'Warm Up': 'warm_up_access',
        'Calendario': 'weekly_planner_access',
        'Estudos': 'studies_access',
        'Biblioteca': 'performance_access',
        'Analytics': 'analytics_access',
        'Usuarios': 'user_management',
        'Bugs': 'system_config',
        'Admin Full': 'admin_full'
    };
    
    // Para cada usuário, aplicar as permissões corretas
    for (const user of users) {
        console.log(`\n🔍 PROCESSANDO USUÁRIO: ${user.email} (${user.user_platform_id})`);
        console.log(`   Plano: ${user.subscription_plan}`);
        
        // Obter as tags do plano
        const subscriptionProfile = SUBSCRIPTION_PROFILES[user.subscription_plan];
        if (!subscriptionProfile) {
            console.log(`   ⚠️  Plano não encontrado: ${user.subscription_plan}`);
            continue;
        }
        
        console.log(`   Tags do plano: ${subscriptionProfile.tags.join(', ')}`);
        
        // Limpar permissões existentes
        await db.execute(sql`
            DELETE FROM user_permissions 
            WHERE user_id = ${user.id}
        `);
        
        console.log(`   🧹 Permissões existentes removidas`);
        
        // Aplicar novas permissões
        const permissionsToApply = [];
        
        for (const tag of subscriptionProfile.tags) {
            const permissionName = tagToPermissionMap[tag];
            if (permissionName) {
                const permission = permissions.find(p => p.name === permissionName);
                if (permission) {
                    permissionsToApply.push(permission);
                }
            }
        }
        
        console.log(`   📝 Aplicando ${permissionsToApply.length} permissões:`);
        
        for (const permission of permissionsToApply) {
            await db.execute(sql`
                INSERT INTO user_permissions (user_id, permission_id, status, granted, created_at, updated_at)
                VALUES (${user.id}, ${permission.id}, 'active', true, NOW(), NOW())
            `);
            
            console.log(`     ✅ ${permission.name}`);
        }
        
        console.log(`   🎉 Permissões aplicadas com sucesso!`);
    }
    
    console.log('\n🎯 VERIFICAÇÃO FINAL:');
    console.log('====================');
    
    // Verificar as permissões aplicadas
    for (const user of users) {
        const userPermissions = await db.execute(sql`
            SELECT p.name 
            FROM user_permissions up
            JOIN permissions p ON p.id = up.permission_id
            WHERE up.user_id = ${user.id}
            ORDER BY p.name
        `);
        
        console.log(`\n${user.email} (${user.subscription_plan}):`);
        console.log(`  Permissões: ${userPermissions.map(p => p.name).join(', ')}`);
        console.log(`  Total: ${userPermissions.length}`);
    }
    
    console.log('\n✅ CORREÇÃO CONCLUÍDA COM SUCESSO!');
    process.exit(0);
}

// Executar o script
fixUserPermissions().catch(error => {
    console.error('❌ ERRO:', error);
    process.exit(1);
});