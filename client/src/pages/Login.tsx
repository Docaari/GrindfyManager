import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, User, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';

const loginSchema = z.object({
  email: z.string().email('Email inválido').min(1, 'Email é obrigatório'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  rememberMe: z.boolean().default(false)
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false
    }
  });

  const emailValue = watch('email');
  const passwordValue = watch('password');
  const rememberMeValue = watch('rememberMe');

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: data.email,
          password: data.password
        })
      });

      if (response.success) {
        // Store tokens
        localStorage.setItem('accessToken', response.data.accessToken);
        localStorage.setItem('refreshToken', response.data.refreshToken);
        
        // Store remember me preference
        if (data.rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('userEmail', data.email);
        }

        toast({
          title: "Login realizado com sucesso!",
          description: `Bem-vindo(a), ${response.data.user.name}!`,
        });

        // Redirect to dashboard
        setLocation('/');
      } else {
        throw new Error(response.message || 'Erro ao fazer login');
      }
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message || "Email ou senha incorretos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getFieldValidationState = (fieldName: keyof LoginFormData) => {
    const hasError = errors[fieldName];
    const hasValue = watch(fieldName);
    
    if (hasError) return 'error';
    if (hasValue && fieldName !== 'rememberMe') return 'success';
    return 'default';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-red-600">G</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Grindfy</h1>
            <p className="text-red-100 text-sm">Faça login para continuar</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300 font-medium">
                Email
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className={`pl-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200 ${
                    getFieldValidationState('email') === 'error' 
                      ? 'border-red-500 focus:ring-red-500' 
                      : getFieldValidationState('email') === 'success'
                      ? 'border-green-500 focus:ring-green-500'
                      : ''
                  }`}
                  {...register('email')}
                />
                {getFieldValidationState('email') === 'success' && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                )}
              </div>
              {errors.email && (
                <p className="text-red-400 text-sm">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300 font-medium">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={`pl-10 pr-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200 ${
                    getFieldValidationState('password') === 'error' 
                      ? 'border-red-500 focus:ring-red-500' 
                      : getFieldValidationState('password') === 'success'
                      ? 'border-green-500 focus:ring-green-500'
                      : ''
                  }`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {getFieldValidationState('password') === 'success' && (
                  <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                )}
              </div>
              {errors.password && (
                <p className="text-red-400 text-sm">{errors.password.message}</p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMeValue}
                onCheckedChange={(checked) => setValue('rememberMe', checked as boolean)}
                className="border-gray-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
              />
              <Label htmlFor="rememberMe" className="text-gray-300 text-sm cursor-pointer">
                Lembrar-me
              </Label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium py-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>

            {/* Forgot Password Link */}
            <div className="text-center">
              <button
                type="button"
                className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                onClick={() => {
                  toast({
                    title: "Funcionalidade em desenvolvimento",
                    description: "Reset de senha estará disponível em breve",
                  });
                }}
              >
                Esqueci minha senha
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-gray-400 text-sm">
            Não tem uma conta?{' '}
            <button
              onClick={() => {
                toast({
                  title: "Registro em desenvolvimento",
                  description: "Funcionalidade de registro estará disponível em breve",
                });
              }}
              className="text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              Registre-se
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}