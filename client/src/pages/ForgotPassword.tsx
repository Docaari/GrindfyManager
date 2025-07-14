import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { forgotPasswordSchema, type ForgotPasswordData } from '@shared/schema';
import { Mail, ArrowLeft, Check } from 'lucide-react';

export default function ForgotPassword() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  const form = useForm<ForgotPasswordData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordData) => {
    setIsLoading(true);
    
    try {
      const response = await apiRequest('POST', '/api/auth/forgot-password', data);
      
      if (response.ok) {
        setSentEmail(data.email);
        setEmailSent(true);
        
        toast({
          title: "Email enviado!",
          description: "Se o email existir, um link de redefinição foi enviado.",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Erro ao enviar email",
          description: error.message || "Erro interno do servidor",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              Email Enviado!
            </CardTitle>
            <CardDescription className="text-gray-300">
              Instruções enviadas para <strong>{sentEmail}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="bg-blue-900/20 border-blue-500/30">
              <Mail className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-200">
                Se o email existir em nossa base de dados, você receberá um link para redefinir sua senha.
                Verifique sua caixa de entrada e pasta de spam.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4">
              <p className="text-gray-400 text-sm text-center">
                Não recebeu o email? Verifique sua pasta de spam ou tente novamente.
              </p>
              
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setEmailSent(false);
                    form.reset();
                  }}
                >
                  Tentar Novamente
                </Button>
                
                <Link href="/login">
                  <Button variant="ghost" className="w-full">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar ao Login
                  </Button>
                </Link>
              </div>
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
            Esqueceu a Senha?
          </CardTitle>
          <CardDescription className="text-gray-300">
            Digite seu email para receber um link de redefinição
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando...
                  </div>
                ) : (
                  'Enviar Link de Redefinição'
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-red-400 hover:text-red-300 font-medium inline-flex items-center">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}