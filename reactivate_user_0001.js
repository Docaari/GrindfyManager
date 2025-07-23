
// Script to reactivate USER-0001
const { db } = require('./server/db');
const { users } = require('./shared/schema');
const { eq } = require('drizzle-orm');

async function reactivateUser() {
  try {
    console.log('🔍 REATIVAÇÃO USER-0001 - Iniciando processo...');
    
    // Find the user by userPlatformId
    const [user] = await db.select()
      .from(users)
      .where(eq(users.userPlatformId, 'USER-0001'));
    
    if (!user) {
      console.log('❌ USER-0001 não encontrado na base de dados');
      return;
    }
    
    console.log('📋 ESTADO ATUAL do USER-0001:', {
      id: user.id,
      userPlatformId: user.userPlatformId,
      email: user.email,
      status: user.status,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      emailVerified: user.emailVerified
    });
    
    // Reactivate the user
    const [updatedUser] = await db.update(users)
      .set({
        status: 'active',
        failedLoginAttempts: 0,
        lockedUntil: null,
        emailVerified: true, // Ensure email is verified
        updatedAt: new Date()
      })
      .where(eq(users.userPlatformId, 'USER-0001'))
      .returning();
    
    console.log('✅ USER-0001 REATIVADO COM SUCESSO!');
    console.log('📋 NOVO ESTADO:', {
      id: updatedUser.id,
      userPlatformId: updatedUser.userPlatformId,
      email: updatedUser.email,
      status: updatedUser.status,
      failedLoginAttempts: updatedUser.failedLoginAttempts,
      lockedUntil: updatedUser.lockedUntil,
      emailVerified: updatedUser.emailVerified
    });
    
    console.log('🎉 USER-0001 pode agora fazer login normalmente!');
    
  } catch (error) {
    console.error('❌ ERRO na reativação:', error);
  } finally {
    process.exit(0);
  }
}

// Execute the reactivation
reactivateUser();
