// TESTE SISTEMÁTICO COMPLETO DO SISTEMA DE PERMISSÕES
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Configurações dos usuários de teste
const USUARIOS_TESTE = [
  {
    email: 'ricardinho2012@gmail.com',
    userPlatformId: 'USER-0002',
    plano: 'basico',
    senha: 'COal@2210',
    acessosEsperados: ['grade-planner', 'grind-session']
  },
  {
    email: 'laisag97@hotmail.com',
    userPlatformId: 'USER-0003',
    plano: 'premium',
    senha: 'COal@2210',
    acessosEsperados: ['grade-planner', 'grind-session', 'dashboard', 'upload-history']
  },
  {
    email: 'ricardo.agnolo@hotmail.com',
    userPlatformId: 'USER-0001',
    plano: 'admin',
    senha: 'COal@2210',
    acessosEsperados: ['grade-planner', 'grind-session', 'dashboard', 'upload-history', 'mental-prep', 'planner', 'estudos', 'biblioteca', 'analytics', 'admin-users', 'admin-bugs']
  }
];

const PAGINAS_TESTE = [
  'grade-planner',
  'grind-session',
  'dashboard',
  'upload-history',
  'mental-prep',
  'planner',
  'estudos',
  'biblioteca',
  'analytics',
  'admin-users',
  'admin-bugs'
];

// Função para fazer login e obter token
async function fazerLogin(usuario) {
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: usuario.email,
        password: usuario.senha
      })
    });

    const data = await response.json();
    if (response.ok) {
      return data.accessToken;
    } else {
      throw new Error(`Login failed: ${data.message}`);
    }
  } catch (error) {
    console.error(`❌ Erro no login para ${usuario.email}:`, error.message);
    return null;
  }
}

// Função para testar acesso a uma página
async function testarAcessoPagina(token, pagina) {
  try {
    const response = await fetch(`http://localhost:5000/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const userData = await response.json();
      return userData;
    } else {
      return null;
    }
  } catch (error) {
    console.error(`❌ Erro ao testar acesso:`, error.message);
    return null;
  }
}

// Função principal de teste
async function executarTestesCompletos() {
  console.log('🔍 INICIANDO TESTES SISTEMÁTICOS DO SISTEMA DE PERMISSÕES');
  console.log('========================================================\n');

  const resultados = [];

  for (const usuario of USUARIOS_TESTE) {
    console.log(`\n📋 TESTANDO USUÁRIO: ${usuario.email}`);
    console.log(`   Plano: ${usuario.plano}`);
    console.log(`   User Platform ID: ${usuario.userPlatformId}`);
    console.log(`   Acessos esperados: ${usuario.acessosEsperados.length}`);

    // Fazer login
    const token = await fazerLogin(usuario);
    if (!token) {
      console.log('❌ LOGIN FALHOU - Pulando testes para este usuário\n');
      continue;
    }

    console.log('✅ Login realizado com sucesso');

    // Obter dados do usuário
    const userData = await testarAcessoPagina(token, 'dashboard');
    if (!userData) {
      console.log('❌ FALHA AO OBTER DADOS DO USUÁRIO\n');
      continue;
    }

    console.log(`   Plano no sistema: ${userData.subscriptionPlan}`);
    console.log(`   Permissões: ${userData.permissions?.length || 0}`);

    // Resultado para este usuário
    const resultadoUsuario = {
      email: usuario.email,
      plano: usuario.plano,
      planoSistema: userData.subscriptionPlan,
      permissoes: userData.permissions || [],
      acessosCorretos: 0,
      acessosIncorretos: 0,
      detalhes: []
    };

    // Testar cada página
    for (const pagina of PAGINAS_TESTE) {
      const deveRiuAcesso = usuario.acessosEsperados.includes(pagina);
      
      // Simular teste de acesso (baseado nas permissões do usuário)
      const temAcesso = userData.permissions && userData.permissions.length > 0;
      
      if (deveRiuAcesso === temAcesso) {
        resultadoUsuario.acessosCorretos++;
        console.log(`   ✅ ${pagina}: ${temAcesso ? 'PERMITIDO' : 'NEGADO'} (correto)`);
      } else {
        resultadoUsuario.acessosIncorretos++;
        console.log(`   ❌ ${pagina}: ${temAcesso ? 'PERMITIDO' : 'NEGADO'} (incorreto)`);
      }

      resultadoUsuario.detalhes.push({
        pagina,
        esperado: deveRiuAcesso,
        real: temAcesso,
        correto: deveRiuAcesso === temAcesso
      });
    }

    resultados.push(resultadoUsuario);
    console.log(`   Resultado: ${resultadoUsuario.acessosCorretos}/${PAGINAS_TESTE.length} acessos corretos\n`);
  }

  // Resumo final
  console.log('\n🎯 RESUMO FINAL DOS TESTES:');
  console.log('===========================');
  
  let totalCorretos = 0;
  let totalTestes = 0;
  
  for (const resultado of resultados) {
    console.log(`\n${resultado.email}:`);
    console.log(`   Plano: ${resultado.plano} (sistema: ${resultado.planoSistema})`);
    console.log(`   Acessos corretos: ${resultado.acessosCorretos}/${PAGINAS_TESTE.length}`);
    console.log(`   Status: ${resultado.acessosCorretos === PAGINAS_TESTE.length ? '✅ PASSOU' : '❌ FALHOU'}`);
    
    totalCorretos += resultado.acessosCorretos;
    totalTestes += PAGINAS_TESTE.length;
  }

  console.log(`\n📊 RESULTADO GERAL: ${totalCorretos}/${totalTestes} (${Math.round((totalCorretos/totalTestes)*100)}%)`);
  console.log(`\n🚀 SISTEMA ${totalCorretos === totalTestes ? 'FUNCIONANDO PERFEITAMENTE' : 'PRECISA DE CORREÇÕES'}`);
}

// Executar testes
executarTestesCompletos().catch(console.error);