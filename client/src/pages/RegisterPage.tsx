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
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

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
    console.log('🔄 REGISTER START - Iniciando registro para:', data.email);
    
    try {
      const response = await apiRequest('POST', '/api/auth/register', data);
      console.log('📡 REGISTER RESPONSE - Status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ REGISTER SUCCESS - Dados:', result);
        console.log('📧 EMAIL VERIFICATION - requiresVerification:', result.requiresVerification);
        
        // Store email for confirmation page
        localStorage.setItem('grindfy_registration_email', data.email);
        console.log('💾 STORAGE - Email salvo no localStorage');
        
        // Show success toast before redirect
        toast({
          title: "Conta criada com sucesso!",
          description: "Email de verificação enviado. Verifique sua caixa de entrada.",
          variant: "default",
        });
        
        // Small delay to show toast, then redirect
        setTimeout(() => {
          console.log('🚀 REDIRECT - Redirecionando para página de confirmação');
          setLocation(`/registration-confirmation?email=${encodeURIComponent(data.email)}`);
        }, 1000);
        
        return;
      } else {
        const error = await response.json();
        
        // Tratamento específico de erros
        if (response.status === 400 && 
            (error.message?.includes('já está em uso') || 
             error.message?.includes('already exists') ||
             error.message?.includes('User already exists'))) {
          toast({
            title: "Email já cadastrado",
            description: "Este email já está cadastrado. Tente fazer login ou use outro email.",
            variant: "destructive",
          });
        } else if (response.status === 400) {
          toast({
            title: "Dados inválidos",
            description: "Dados inválidos. Verifique as informações e tente novamente.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Erro",
            description: error.message || "Erro ao criar conta",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      console.log('🔍 DEBUG RegisterPage - Erro completo:', error);
      console.log('🔍 DEBUG RegisterPage - Response status:', error.response?.status);
      console.log('🔍 DEBUG RegisterPage - Response data:', error.response?.data);
      console.log('🔍 DEBUG RegisterPage - Error message:', error.message);
      
      // Tratamento específico de erros baseado na resposta
      if (error.response?.status === 400 && 
          (error.message?.includes('já está em uso') || 
           error.response?.data?.message?.includes('já está em uso') ||
           error.message?.includes('already exists') ||
           error.message?.toLowerCase().includes('email'))) {
        toast({
          title: "Email já cadastrado",
          description: "Este email já está cadastrado. Tente fazer login ou use outro email.",
          variant: "destructive",
        });
      } else if (error.response?.status === 400) {
        toast({
          title: "Dados inválidos",
          description: "Dados inválidos. Verifique as informações e tente novamente.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro de conexão",
          description: "Erro de conexão. Tente novamente.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">
            Criar Conta
          </CardTitle>
          <CardDescription className="text-gray-300">
            Complete suas informações para criar uma conta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-white">Nome Completo</Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome completo"
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-red-400 text-sm">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-red-400 text-sm">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Sua senha"
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 pr-10"
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-sm">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-white">Confirmar Senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirme sua senha"
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 pr-10"
                  {...register('confirmPassword')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
              {errors.confirmPassword && (
                <p className="text-red-400 text-sm">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar Conta'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Já tem uma conta?{' '}
              <Link href="/login" className="text-red-400 hover:text-red-300">
                Faça login
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}