const fs = require('fs');
const path = require('path');

// Ler o arquivo routes.ts
const routesPath = path.join(__dirname, 'server', 'routes.ts');
let content = fs.readFileSync(routesPath, 'utf8');

// Substituir todas as ocorrências de isAuthenticated por requireAuth
content = content.replace(/isAuthenticated/g, 'requireAuth');

// Substituir todas as ocorrências de req.user.claims.sub por req.user.id
content = content.replace(/req\.user\.claims\.sub/g, 'req.user.id');

// Salvar o arquivo modificado
fs.writeFileSync(routesPath, content);

console.log('✅ Migração concluída com sucesso!');
console.log('- Substituído isAuthenticated por requireAuth');
console.log('- Substituído req.user.claims.sub por req.user.id');