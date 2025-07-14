import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation('/dashboard');
    }
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      
      if (result.success) {
        setLocation('/dashboard');
      } else {
        setError(result.message || 'Erro no login');
      }
    } catch (error) {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">
            Grind<span className="text-red-500">fy</span>
          </h1>
          <p className="text-gray-300">
            Sua plataforma de otimização de performance no poker
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Fazer Login
          </h2>

          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <span className="text-red-400 mr-2">⚠️</span>
                <span className="text-red-200">{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Senha
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Sua senha"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Problemas para acessar?
            </p>
            <div className="mt-3 space-y-2">
              <a
                href="https://wa.me/5511999999999"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-green-400 hover:text-green-300 text-sm transition-colors"
              >
                <span className="mr-1">📱</span>
                Contatar via WhatsApp
              </a>
              <span className="text-gray-600 mx-2">•</span>
              <a
                href="https://discord.gg/grindfy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
              >
                <span className="mr-1">💬</span>
                Suporte no Discord
              </a>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-gray-500 text-sm">
            © 2025 Grindfy. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;