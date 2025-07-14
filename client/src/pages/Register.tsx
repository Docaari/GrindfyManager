import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { registerSchema, type RegisterData } from '@shared/schema';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react';

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const form = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterData) => {
    setIsLoading(true);
    
    try {
      const response = await apiRequest('POST', '/api/auth/register', data);
      
      if (response.ok) {
        const result = await response.json();
        setRegisteredEmail(data.email);
        setRegistrationSuccess(true);
        
        toast({
          title: "Conta criada com sucesso!",
          description: "Verifique seu email para ativar sua conta.",
        });
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          setLocation('/login');
        }, 3000);
      } else {
        const error = await response.json();
        toast({
          title: "Erro ao criar conta",
          description: error.message || "Erro interno do servidor",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              Conta Criada com Sucesso!
            </CardTitle>
            <CardDescription className="text-gray-300">
              Enviamos um email de verificação para <strong>{registeredEmail}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="bg-green-900/20 border-green-500/30">
              <Mail className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-200">
                Verifique sua caixa de entrada e clique no link para ativar sua conta. 
                Se não encontrar o email, verifique a pasta de spam.
              </AlertDescription>
            </Alert>
            
            <div className="text-center space-y-4">
              <p className="text-gray-400 text-sm">
                Redirecionando para a página de login...
              </p>
              
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Ir para Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">
            Criar Conta
          </CardTitle>
          <CardDescription className="text-gray-300">
            Junte-se ao Grindfy e otimize sua performance no poker
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Nome Completo</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          placeholder="Seu nome completo"
                          className="pl-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type="email"
                          placeholder="seu@email.com"
                          className="pl-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Mínimo 8 caracteres"
                          className="pl-10 pr-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Confirmar Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Confirme sua senha"
                          className="pl-10 pr-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-white"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Criando conta...
                  </div>
                ) : (
                  'Criar Conta'
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Já tem uma conta?{' '}
              <Link href="/login" className="text-red-400 hover:text-red-300 font-medium">
                Fazer login
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}