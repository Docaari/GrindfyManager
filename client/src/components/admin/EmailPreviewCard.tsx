import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface EmailPreviewCardProps {
  type: 'verification' | 'welcome' | 'password-reset';
  title: string;
  description: string;
  icon: React.ReactNode;
  badges: Array<{
    text: string;
    variant: 'outline' | 'default';
    className?: string;
  }>;
}

// Templates de email inline para visualizacao
export const getEmailTemplate = (type: string): string => {
  const templates = {
    verification: `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">

          <!-- Header com Logo + Marca (Fundo Escuro) -->
          <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 60px 40px; text-align: center; position: relative;">
            <!-- Logo Real do Grindfy -->
            <div style="display: inline-block; margin-bottom: 20px;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; background-color: rgba(15, 23, 42, 0.1); border-radius: 50%; border: 3px solid rgba(0, 255, 136, 0.3);">
                <span style="color: #00ff88; font-size: 36px; font-weight: 900; font-family: 'Inter', sans-serif;">G</span>
              </div>
            </div>

            <!-- Marca Grindfy com Cores Corretas -->
            <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.02em;">
              <span style="color: #ffffff;">Grind</span><span style="color: #00ff88;">fy</span>
            </h1>
            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.7); font-size: 16px; font-weight: 500;">Poker Analytics Platform</p>
          </div>

          <!-- Conteudo Principal -->
          <div style="padding: 50px 40px; background-color: #1e293b;">

            <!-- Card de Confirmacao -->
            <div style="background: linear-gradient(135deg, #334155 0%, #475569 100%); padding: 40px; border-radius: 12px; border: 1px solid rgba(0, 255, 136, 0.1); margin-bottom: 30px;">
              <h2 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 24px 0; text-align: center;">Bem-vindo ao Grindfy!</h2>

              <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                A plataforma que centraliza tudo o que um grinder precisa para performar em alto nivel.
              </p>

              <p style="line-height: 1.7; margin: 0 0 32px 0; color: #94a3b8; font-size: 15px; text-align: center;">
                Confirme seu e-mail para ativar sua conta e comecar sua jornada rumo a consistencia e lucro.
              </p>

              <!-- Botao Principal Grande -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="#" style="display: inline-block; background: linear-gradient(135deg, #00ff88 0%, #10b981 100%); color: #0f172a; text-decoration: none; padding: 20px 50px; border-radius: 12px; font-weight: 700; font-size: 18px; letter-spacing: 0.5px; transition: all 0.3s ease; box-shadow: 0 12px 30px rgba(0, 255, 136, 0.4);">
                  Confirmar Email
                </a>
              </div>
            </div>

            <!-- Informacoes de Validade -->
            <div style="background-color: rgba(51, 65, 85, 0.3); padding: 24px; border-radius: 8px; border-left: 4px solid #00ff88; margin-bottom: 24px;">
              <p style="margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                <strong style="color: #00ff88;">Dica:</strong> Este link de confirmacao expira em 24 horas. Se voce nao conseguir confirmar, podera solicitar um novo link na pagina de login.
              </p>
            </div>

            <!-- Linha Separadora -->
            <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent); margin: 40px 0;"></div>

            <!-- Texto de Seguranca -->
            <p style="line-height: 1.6; margin: 0; color: #64748b; font-size: 13px; text-align: center;">
              Se voce nao criou uma conta no Grindfy, pode ignorar este email com seguranca. Nenhuma acao sera tomada em sua conta.
            </p>
          </div>

          <!-- Footer -->
          <div style="padding: 30px 40px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); text-align: center; border-top: 1px solid rgba(0, 255, 136, 0.1);">
            <div style="margin-bottom: 16px;">
              <span style="color: #ffffff; font-weight: 700; font-size: 18px;">Grind</span><span style="color: #00ff88; font-weight: 700; font-size: 18px;">fy</span>
            </div>
            <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">&copy; 2025 Grindfy - Plataforma de Analytics para Poker</p>
            <p style="margin: 0; color: #475569; font-size: 12px;">Este email foi enviado automaticamente, nao responda.</p>
          </div>
        </div>
      </div>
    `,
    welcome: `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">

          <!-- Header com Logo + Marca (Mesmo do Email de Confirmacao) -->
          <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 60px 40px; text-align: center; position: relative;">
            <!-- Logo Real do Grindfy -->
            <div style="display: inline-block; margin-bottom: 20px;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; background-color: rgba(15, 23, 42, 0.1); border-radius: 50%; border: 3px solid rgba(0, 255, 136, 0.3);">
                <span style="color: #00ff88; font-size: 36px; font-weight: 900; font-family: 'Inter', sans-serif;">G</span>
              </div>
            </div>

            <!-- Marca Grindfy com Cores Corretas -->
            <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.02em;">
              <span style="color: #ffffff;">Grind</span><span style="color: #00ff88;">fy</span>
            </h1>
            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.7); font-size: 16px; font-weight: 500;">Poker Analytics Platform</p>
          </div>

          <!-- Conteudo Principal -->
          <div style="padding: 50px 40px; background-color: #1e293b;">

            <!-- Card de Boas-vindas -->
            <div style="background: linear-gradient(135deg, #334155 0%, #475569 100%); padding: 40px; border-radius: 12px; border: 1px solid rgba(0, 255, 136, 0.1); margin-bottom: 30px;">
              <h2 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 24px 0; text-align: center;">Conta verificada com sucesso!</h2>

              <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                Parabens! Sua conta no Grindfy foi verificada e esta pronta para uso.
              </p>

              <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                Agora voce ja tem acesso a plataforma.
              </p>

              <p style="line-height: 1.7; margin: 0 0 32px 0; color: #94a3b8; font-size: 15px; text-align: center;">
                Comece a registrar seus torneios, analisar seu historico e impulsione sua performance!
              </p>

              <!-- Botao Principal Grande -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="#" style="display: inline-block; background: linear-gradient(135deg, #00ff88 0%, #10b981 100%); color: #0f172a; text-decoration: none; padding: 20px 50px; border-radius: 12px; font-weight: 700; font-size: 18px; letter-spacing: 0.5px; transition: all 0.3s ease; box-shadow: 0 12px 30px rgba(0, 255, 136, 0.4);">
                  Acessar Grindfy
                </a>
              </div>
            </div>

            <!-- Linha Separadora -->
            <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent); margin: 40px 0;"></div>

            <!-- Texto de Seguranca -->
            <p style="line-height: 1.6; margin: 0; color: #64748b; font-size: 13px; text-align: center;">
              Se voce nao criou uma conta no Grindfy, pode ignorar este email com seguranca. Nenhuma acao sera tomada em sua conta.
            </p>
          </div>

          <!-- Footer (Identico ao Email de Confirmacao) -->
          <div style="padding: 30px 40px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); text-align: center; border-top: 1px solid rgba(0, 255, 136, 0.1);">
            <div style="margin-bottom: 16px;">
              <span style="color: #ffffff; font-weight: 700; font-size: 18px;">Grind</span><span style="color: #00ff88; font-weight: 700; font-size: 18px;">fy</span>
            </div>
            <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">&copy; 2025 Grindfy - Plataforma de Analytics para Poker</p>
            <p style="margin: 0; color: #475569; font-size: 12px;">Este email foi enviado automaticamente, nao responda.</p>
          </div>
        </div>
      </div>
    `,
    'password-reset': `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">

          <!-- Header com Logo + Marca (Mesmo do Email de Confirmacao) -->
          <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 60px 40px; text-align: center; position: relative;">
            <!-- Logo Real do Grindfy -->
            <div style="display: inline-block; margin-bottom: 20px;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; background-color: rgba(15, 23, 42, 0.1); border-radius: 50%; border: 3px solid rgba(0, 255, 136, 0.3);">
                <span style="color: #00ff88; font-size: 36px; font-weight: 900; font-family: 'Inter', sans-serif;">G</span>
              </div>
            </div>

            <!-- Marca Grindfy com Cores Corretas -->
            <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.02em;">
              <span style="color: #ffffff;">Grind</span><span style="color: #00ff88;">fy</span>
            </h1>
            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.7); font-size: 16px; font-weight: 500;">Poker Analytics Platform</p>
          </div>

          <!-- Conteudo Principal -->
          <div style="padding: 50px 40px; background-color: #1e293b;">

            <!-- Card de Reset de Senha -->
            <div style="background: linear-gradient(135deg, #334155 0%, #475569 100%); padding: 40px; border-radius: 12px; border: 1px solid rgba(0, 255, 136, 0.1); margin-bottom: 30px;">
              <h2 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 24px 0; text-align: center;">Reset de senha</h2>

              <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                Recebemos uma solicitacao para redefinir a senha da sua conta no Grindfy.
              </p>

              <p style="line-height: 1.7; margin: 0 0 32px 0; color: #94a3b8; font-size: 15px; text-align: center;">
                Clique no botao abaixo para criar uma nova senha:
              </p>

              <!-- Botao Principal Grande -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="#" style="display: inline-block; background: linear-gradient(135deg, #00ff88 0%, #10b981 100%); color: #0f172a; text-decoration: none; padding: 20px 50px; border-radius: 12px; font-weight: 700; font-size: 18px; letter-spacing: 0.5px; transition: all 0.3s ease; box-shadow: 0 12px 30px rgba(0, 255, 136, 0.4);">
                  Redefinir Senha
                </a>
              </div>
            </div>

            <!-- Aviso de Expiracao -->
            <div style="background-color: rgba(51, 65, 85, 0.3); padding: 24px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 24px;">
              <p style="margin: 0 0 12px 0; color: #f59e0b; font-size: 16px; font-weight: 600;">Este link expira em 1 hora</p>
              <p style="margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                Por seguranca, este link de reset so e valido por 60 minutos.
              </p>
            </div>

            <!-- Linha Separadora -->
            <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent); margin: 40px 0;"></div>

            <!-- Texto de Seguranca -->
            <p style="line-height: 1.6; margin: 0; color: #64748b; font-size: 13px; text-align: center;">
              Se voce nao solicitou este reset, pode ignorar este email com seguranca. Sua senha nao sera alterada.
            </p>
          </div>

          <!-- Footer (Identico ao Email de Confirmacao) -->
          <div style="padding: 30px 40px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); text-align: center; border-top: 1px solid rgba(0, 255, 136, 0.1);">
            <div style="margin-bottom: 16px;">
              <span style="color: #ffffff; font-weight: 700; font-size: 18px;">Grind</span><span style="color: #00ff88; font-weight: 700; font-size: 18px;">fy</span>
            </div>
            <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">&copy; 2025 Grindfy - Plataforma de Analytics para Poker</p>
            <p style="margin: 0; color: #475569; font-size: 12px;">Este email foi enviado automaticamente, nao responda.</p>
          </div>
        </div>
      </div>
    `
  };

  return templates[type as keyof typeof templates] || '';
};

const EmailPreviewCard: React.FC<EmailPreviewCardProps> = ({ type, title, description, icon, badges }) => {
  const emailHtml = getEmailTemplate(type);

  return (
    <Card className="flex flex-col h-[800px]">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <p className="text-sm text-gray-600">
          {description}
        </p>
        <div className="flex items-center gap-2">
          {badges.map((badge, index) => (
            <Badge
              key={index}
              variant={badge.variant}
              className={`text-xs ${badge.className || ''}`}
            >
              {badge.text}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="h-full border-2 border-gray-200 rounded-lg overflow-hidden">
          {emailHtml ? (
            <div
              className="w-full h-full overflow-auto"
              dangerouslySetInnerHTML={{ __html: emailHtml }}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center space-y-2">
                <p className="text-sm text-gray-500">Preview nao disponivel</p>
                <p className="text-xs text-gray-400">Template nao encontrado</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default EmailPreviewCard;
