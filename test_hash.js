import bcrypt from 'bcryptjs';

async function testHash() {
  // Hash EXATO do banco
  const hashDoBanco = "$2b$12$DTBgXMC7XdkRQC5.MmRMQO2yCwhgNGpvqR5Oa99feD996.PieZhAK";
  const senha = "COal@2210";
  
  console.log('🔍 TESTE MANUAL DE HASH');
  console.log('Hash do banco:', hashDoBanco);
  console.log('Senha testada:', senha);
  
  const teste = await bcrypt.compare(senha, hashDoBanco);
  console.log('✅ Teste manual resultado:', teste);
  
  // Testar geração de novo hash para comparar
  const novoHash = await bcrypt.hash(senha, 12);
  console.log('🔄 Novo hash gerado:', novoHash);
  
  const testeNovoHash = await bcrypt.compare(senha, novoHash);
  console.log('✅ Teste novo hash:', testeNovoHash);
}

testHash().catch(console.error);