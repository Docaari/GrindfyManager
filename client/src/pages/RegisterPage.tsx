import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, AlertCircle, UserPlus } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import grindfyLogoPath from '@assets/image_1753377238747.webp';

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string()
    .min(6, 'A senha deve ter pelo menos 6 caracteres')
    .regex(/^(?=.*[a-zA-Z])(?=.*\d)/, 'A senha deve conter pelo menos uma letra e um número'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"]
});

type RegisterData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema)
  });

  const onSubmit = async (data: RegisterData) => {
    setIsSubmitting(true);

    try {
      const result = await apiRequest('POST', '/api/auth/register', data);
      

      // Verificar se a resposta contém sucesso
      if (result.success && result.message) {
        // Store email for confirmation page
        localStorage.setItem('grindfy_registration_email', data.email);

        // Show success toast with backend message
        toast({
          title: "Sucesso!",
          description: result.message,
          variant: "default",
        });

        // Redirect to confirmation page after showing toast
        setTimeout(() => {
          setLocation(`/registration-confirmation?email=${encodeURIComponent(data.email)}`);
        }, 1000);

        return;
      } else {
        // Resposta sem indicador de sucesso
        toast({
          title: "Erro",
          description: result.message || "Erro inesperado ao criar conta",
          variant: "destructive",
        });
      }
    } catch (error: any) {

      // Verificar se é erro de email duplicado
      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.message || error.message;
        if (errorMessage?.includes('já está em uso') || 
            errorMessage?.includes('already exists') ||
            errorMessage?.includes('User already exists')) {
          toast({
            title: "Email já cadastrado",
            description: "Este email já está cadastrado. Tente fazer login ou use outro email.",
            variant: "destructive",
          });
          return;
        }
      }

      // Erro genérico
      toast({
        title: "Erro no servidor",
        description: error.message || "Erro ao criar conta. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#00ff88] rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-green-400 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-emerald-300 rounded-full blur-2xl"></div>
      </div>

      {/* Geometric Patterns */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 w-full h-full"
             style={{
               backgroundImage: `
                 radial-gradient(circle at 25% 25%, #00ff88 1px, transparent 1px),
                 radial-gradient(circle at 75% 75%, #22c55e 1px, transparent 1px)
               `,
               backgroundSize: '50px 50px'
             }}>
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        {/* Header com Logo */}
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <img 
                src={grindfyLogoPath} 
                alt="Grindfy Logo" 
                className="w-12 h-12 rounded-full border-2 border-[#00ff88]/30"
              />
              <h1 className="text-4xl font-bold">
                <span className="text-white">Grind</span>
                <span className="text-[#00ff88]">fy</span>
              </h1>
            </div>
            <p className="text-gray-300 text-lg">Poker Tournament Tracker</p>
            <div className="w-24 h-1 bg-gradient-to-r from-[#00ff88] to-green-400 mx-auto mt-2 rounded-full"></div>
          </div>

          <Card className="backdrop-blur-xl bg-gray-900/80 border-gray-700/50 shadow-2xl">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                <UserPlus className="h-6 w-6 text-[#00ff88]" />
                Criar Nova Conta
              </CardTitle>
              <CardDescription className="text-gray-300">
                Junte-se à comunidade Grindfy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-white font-medium">Nome Completo</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Digite seu nome completo"
                    className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#00ff88] focus:ring-[#00ff88]/20 transition-colors"
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#00ff88] focus:ring-[#00ff88]/20 transition-colors"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white font-medium">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Digite sua senha"
                      className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#00ff88] focus:ring-[#00ff88]/20 pr-10 transition-colors"
                      {...register('password')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-gray-700/50 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400 hover:text-white" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400 hover:text-white" />
                      )}
                    </Button>
                  </div>
                  {errors.password && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-white font-medium">Confirmar Senha</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirme sua senha"
                      className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#00ff88] focus:ring-[#00ff88]/20 pr-10 transition-colors"
                      {...register('confirmPassword')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-gray-700/50 transition-colors"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400 hover:text-white" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400 hover:text-white" />
                      )}
                    </Button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#00ff88] hover:bg-[#00cc6a] text-black font-semibold"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando conta...
                    </>
                  ) : (
                    'Criar Conta Grindfy'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-gray-400">
                  Já tem uma conta?{' '}
                  <Link href="/login" className="hover:text-[#00ff88] text-[#00ff88] transition-colors underline-offset-4 hover:underline">
                    Faça login
                  </Link>
                </p>
              </div>

              {/* Footer Info */}
              <div className="mt-4 text-center text-xs text-gray-500">
                <p>© 2025 Grindfy - Poker Tournament Tracker</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}