import { z } from 'zod';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// Email verification token storage (in production, use Redis or database)
const emailVerificationTokens = new Map<string, {
  userId: string;
  email: string;
  token: string;
  expiresAt: number;
}>();

// Password reset token storage (in production, use Redis or database)
const passwordResetTokens = new Map<string, {
  userId: string;
  email: string;
  token: string;
  expiresAt: number;
}>();

export class EmailService {
  private static readonly TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly RESET_TOKEN_EXPIRY = 1 * 60 * 60 * 1000; // 1 hour
  private static transporter: Transporter | null = null;

  // SMTP Configuration via environment variables
  private static getTransporter(): Transporter {
    if (!this.transporter) {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (!smtpHost || !smtpUser || !smtpPass) {
        throw new Error('Missing SMTP configuration. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.');
      }

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    }
    return this.transporter;
  }

  // Generate email verification token
  static generateEmailVerificationToken(userId: string, email: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.TOKEN_EXPIRY;

    emailVerificationTokens.set(token, {
      userId,
      email,
      token,
      expiresAt,
    });

    return token;
  }

  // Verify email verification token
  static verifyEmailToken(token: string): { userId: string; email: string } | null {
    const tokenData = emailVerificationTokens.get(token);
    if (!tokenData) return null;

    if (Date.now() > tokenData.expiresAt) {
      emailVerificationTokens.delete(token);
      return null;
    }

    return {
      userId: tokenData.userId,
      email: tokenData.email,
    };
  }

  // Generate password reset token
  static generatePasswordResetToken(userId: string, email: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.RESET_TOKEN_EXPIRY;

    passwordResetTokens.set(token, {
      userId,
      email,
      token,
      expiresAt,
    });

    return token;
  }

  // Verify password reset token
  static verifyPasswordResetToken(token: string): { userId: string; email: string } | null {
    const tokenData = passwordResetTokens.get(token);
    if (!tokenData) return null;

    if (Date.now() > tokenData.expiresAt) {
      passwordResetTokens.delete(token);
      return null;
    }

    return {
      userId: tokenData.userId,
      email: tokenData.email,
    };
  }

  // Send email verification with Gmail SMTP
  static async sendEmailVerification(email: string, token: string): Promise<boolean> {
    try {
      const baseUrl = process.env.BASE_URL
        || `http://localhost:${process.env.PORT || '3000'}`;
      const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
      
      const htmlTemplate = this.getEmailVerificationTemplate(verificationUrl);
      
      const mailOptions = {
        from: {
          name: process.env.SMTP_FROM_NAME || 'Grindfy',
          address: process.env.SMTP_FROM_ADDRESS || process.env.SMTP_USER || ''
        },
        to: email,
        subject: '✅ Confirme seu email - Grindfy',
        html: htmlTemplate,
        text: `Bem-vindo ao Grindfy! Confirme seu email clicando no link: ${verificationUrl}`
      };

      const transporter = this.getTransporter();
      await transporter.sendMail(mailOptions);
      
      console.log(`📧 EMAIL VERIFICATION - Email enviado para: ${email}`);
      console.log(`🔗 Verification URL: ${verificationUrl}`);
      
      return true;
    } catch (error) {
      console.error('Erro ao enviar email de verificação:', error);
      return false;
    }
  }

  // Send password reset email with Gmail SMTP
  static async sendPasswordReset(email: string, token: string): Promise<boolean> {
    try {
      const baseUrl = process.env.BASE_URL
        || `http://localhost:${process.env.PORT || '3000'}`;
      const resetUrl = `${baseUrl}/reset-password/${token}`;
      
      const htmlTemplate = this.getPasswordResetTemplate(resetUrl);
      
      const mailOptions = {
        from: {
          name: process.env.SMTP_FROM_NAME || 'Grindfy',
          address: process.env.SMTP_FROM_ADDRESS || process.env.SMTP_USER || ''
        },
        to: email,
        subject: '🔒 Reset de senha - Grindfy',
        html: htmlTemplate,
        text: `Reset sua senha do Grindfy clicando no link: ${resetUrl} (válido por 1 hora)`
      };

      const transporter = this.getTransporter();
      await transporter.sendMail(mailOptions);
      
      console.log(`📧 PASSWORD RESET - Email enviado para: ${email}`);
      console.log(`🔗 Reset URL: ${resetUrl}`);
      
      return true;
    } catch (error) {
      console.error('Erro ao enviar email de reset de senha:', error);
      return false;
    }
  }

  // Verify user email and send welcome email
  static async verifyUserEmail(token: string): Promise<boolean> {
    try {
      const tokenData = this.verifyEmailToken(token);
      if (!tokenData) {
        return false;
      }

      // Get user details for welcome email
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, tokenData.userId));

      if (!user) {
        return false;
      }

      // Update user email verification status
      await db.update(users)
        .set({
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, tokenData.userId));

      // Remove used token
      emailVerificationTokens.delete(token);

      // Send welcome email
      await this.sendWelcomeEmail(user.email!, user.firstName);

      console.log(`✅ Email verificado com sucesso para: ${user.email}`);
      return true;
    } catch (error) {
      console.error('Error verifying user email:', error);
      return false;
    }
  }

  // Verify user email and return user email for auto-login
  static async verifyUserEmailWithData(token: string): Promise<string | null> {
    try {
      const tokenData = this.verifyEmailToken(token);
      if (!tokenData) return null;

      // Get user details for welcome email
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, tokenData.userId));

      if (!user) return null;

      // Update user email verification status and make account active
      await db.update(users)
        .set({
          emailVerified: true,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(users.id, tokenData.userId));

      // Remove used token
      emailVerificationTokens.delete(token);

      // Send welcome email
      await this.sendWelcomeEmail(user.email!, user.firstName);

      console.log(`✅ Email verificado com sucesso para auto-login: ${user.email}`);
      return user.email!;
    } catch (error) {
      console.error('Error verifying user email for auto-login:', error);
      return null;
    }
  }

  // Clean up expired tokens
  static cleanupExpiredTokens() {
    const now = Date.now();
    
    // Clean up email verification tokens
    for (const [token, data] of emailVerificationTokens.entries()) {
      if (now > data.expiresAt) {
        emailVerificationTokens.delete(token);
      }
    }

    // Clean up password reset tokens
    for (const [token, data] of passwordResetTokens.entries()) {
      if (now > data.expiresAt) {
        passwordResetTokens.delete(token);
      }
    }
  }

  // Send welcome email after email verification
  static async sendWelcomeEmail(email: string, firstName?: string): Promise<boolean> {
    try {
      const htmlTemplate = this.getWelcomeEmailTemplate(firstName || 'Jogador');
      
      const mailOptions = {
        from: {
          name: process.env.SMTP_FROM_NAME || 'Grindfy',
          address: process.env.SMTP_FROM_ADDRESS || process.env.SMTP_USER || ''
        },
        to: email,
        subject: '🎉 Bem-vindo ao Grindfy!',
        html: htmlTemplate,
        text: `Bem-vindo ao Grindfy! Sua conta foi verificada com sucesso. Comece a rastrear seus torneios agora!`
      };

      const transporter = this.getTransporter();
      await transporter.sendMail(mailOptions);
      
      console.log(`📧 WELCOME EMAIL - Email enviado para: ${email}`);
      
      return true;
    } catch (error) {
      console.error('Erro ao enviar email de boas-vindas:', error);
      return false;
    }
  }

  // Resend email verification
  static async resendEmailVerification(email: string): Promise<boolean> {
    try {
      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, email));

      if (!user) {
        return false;
      }

      if (user.emailVerified) {
        return false; // Already verified
      }

      const token = this.generateEmailVerificationToken(user.id, email);
      return await this.sendEmailVerification(email, token);
    } catch (error) {
      console.error('Error resending email verification:', error);
      return false;
    }
  }

  // Test email connection
  static async testEmailConnection(): Promise<boolean> {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      console.log('📧 SMTP Connection: ✅ Conectado com sucesso ao Gmail');
      return true;
    } catch (error) {
      console.error('📧 SMTP Connection: ❌ Erro de conexão:', error);
      return false;
    }
  }

  // HTML Email Templates
  static getEmailVerificationTemplate(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Confirme seu email - Grindfy</title>
      </head>
      <body>
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
          <div style="max-width: 580px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
            
            <!-- Header com Logo + Marca (Fundo Escuro) -->
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 60px 40px; text-align: center; position: relative;">
              <!-- Logo Real do Grindfy -->
              <div style="display: inline-block; margin-bottom: 20px;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; background-color: rgba(15, 23, 42, 0.1); border-radius: 50%; border: 3px solid rgba(0, 255, 136, 0.3);">
                  <span style="color: #00ff88; font-size: 36px; font-weight: 900; font-family: 'Inter', sans-serif; line-height: 1; display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; text-align: center;">G</span>
                </div>
              </div>
              
              <!-- Marca Grindfy com Cores Corretas -->
              <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.02em;">
                <span style="color: #ffffff;">Grind</span><span style="color: #00ff88;">fy</span>
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.7); font-size: 16px; font-weight: 500;">Poker Analytics Platform</p>
            </div>

            <!-- Conteúdo Principal -->
            <div style="padding: 50px 40px; background-color: #1e293b;">
              
              <!-- Card de Confirmação -->
              <div style="background: linear-gradient(135deg, #334155 0%, #475569 100%); padding: 40px; border-radius: 12px; border: 1px solid rgba(0, 255, 136, 0.1); margin-bottom: 30px;">
                <h2 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 24px 0; text-align: center;">Bem-vindo ao Grindfy!</h2>
                
                <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                  A plataforma que centraliza tudo o que um grinder precisa para performar em alto nível.
                </p>
                
                <p style="line-height: 1.7; margin: 0 0 32px 0; color: #94a3b8; font-size: 15px; text-align: center;">
                  Confirme seu e-mail para ativar sua conta e começar sua jornada rumo à consistência e lucro.
                </p>
                
                <!-- Botão Principal Grande -->
                <div style="text-align: center; margin: 40px 0;">
                  <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #00ff88 0%, #10b981 100%); color: #0f172a; text-decoration: none; padding: 20px 50px; border-radius: 12px; font-weight: 700; font-size: 18px; letter-spacing: 0.5px; transition: all 0.3s ease; box-shadow: 0 12px 30px rgba(0, 255, 136, 0.4);">
                    Confirmar Email
                  </a>
                </div>
              </div>

              <!-- Informações de Validade -->
              <div style="background-color: rgba(51, 65, 85, 0.3); padding: 24px; border-radius: 8px; border-left: 4px solid #00ff88; margin-bottom: 24px;">
                <p style="margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                  <strong style="color: #00ff88;">💡 Dica:</strong> Este link de confirmação expira em 24 horas. Se você não conseguir confirmar, poderá solicitar um novo link na página de login.
                </p>
              </div>

              <!-- Linha Separadora -->
              <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent); margin: 40px 0;"></div>
              
              <!-- Texto de Segurança -->
              <p style="line-height: 1.6; margin: 0; color: #64748b; font-size: 13px; text-align: center;">
                Se você não criou uma conta no Grindfy, pode ignorar este email com segurança. Nenhuma ação será tomada em sua conta.
              </p>
            </div>

            <!-- Footer -->
            <div style="padding: 30px 40px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); text-align: center; border-top: 1px solid rgba(0, 255, 136, 0.1);">
              <div style="margin-bottom: 16px;">
                <span style="color: #ffffff; font-weight: 700; font-size: 18px;">Grind</span><span style="color: #00ff88; font-weight: 700; font-size: 18px;">fy</span>
              </div>
              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">© 2025 Grindfy - Plataforma de Analytics para Poker</p>
              <p style="margin: 0; color: #475569; font-size: 12px;">Este email foi enviado automaticamente, não responda.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  static getPasswordResetTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset de senha - Grindfy</title>
      </head>
      <body>
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
          <div style="max-width: 580px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
            
            <!-- Header com Logo + Marca (Mesmo do Email de Confirmação) -->
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 60px 40px; text-align: center; position: relative;">
              <!-- Logo Real do Grindfy -->
              <div style="display: inline-block; margin-bottom: 20px;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; background-color: rgba(15, 23, 42, 0.1); border-radius: 50%; border: 3px solid rgba(0, 255, 136, 0.3);">
                  <span style="color: #00ff88; font-size: 36px; font-weight: 900; font-family: 'Inter', sans-serif; line-height: 1; display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; text-align: center;">G</span>
                </div>
              </div>
              
              <!-- Marca Grindfy com Cores Corretas -->
              <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.02em;">
                <span style="color: #ffffff;">Grind</span><span style="color: #00ff88;">fy</span>
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.7); font-size: 16px; font-weight: 500;">Poker Analytics Platform</p>
            </div>

            <!-- Conteúdo Principal -->
            <div style="padding: 50px 40px; background-color: #1e293b;">
              
              <!-- Card de Reset de Senha -->
              <div style="background: linear-gradient(135deg, #334155 0%, #475569 100%); padding: 40px; border-radius: 12px; border: 1px solid rgba(0, 255, 136, 0.1); margin-bottom: 30px;">
                <h2 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 24px 0; text-align: center;">🔒 Reset de senha</h2>
                
                <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                  Recebemos uma solicitação para redefinir a senha da sua conta no Grindfy.
                </p>
                
                <p style="line-height: 1.7; margin: 0 0 32px 0; color: #94a3b8; font-size: 15px; text-align: center;">
                  Clique no botão abaixo para criar uma nova senha:
                </p>
                
                <!-- Botão Principal Grande -->
                <div style="text-align: center; margin: 40px 0;">
                  <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #00ff88 0%, #10b981 100%); color: #0f172a; text-decoration: none; padding: 20px 50px; border-radius: 12px; font-weight: 700; font-size: 18px; letter-spacing: 0.5px; transition: all 0.3s ease; box-shadow: 0 12px 30px rgba(0, 255, 136, 0.4);">
                    🔐 Redefinir Senha
                  </a>
                </div>
              </div>

              <!-- Aviso de Expiração -->
              <div style="background-color: rgba(51, 65, 85, 0.3); padding: 24px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 24px;">
                <p style="margin: 0 0 12px 0; color: #f59e0b; font-size: 16px; font-weight: 600;">⚠️ Este link expira em 1 hora</p>
                <p style="margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                  Por segurança, este link de reset só é válido por 60 minutos.
                </p>
              </div>

              <!-- Linha Separadora -->
              <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent); margin: 40px 0;"></div>
              
              <!-- Texto de Segurança -->
              <p style="line-height: 1.6; margin: 0; color: #64748b; font-size: 13px; text-align: center;">
                Se você não solicitou este reset, pode ignorar este email com segurança. Sua senha não será alterada.
              </p>
            </div>

            <!-- Footer (Idêntico ao Email de Confirmação) -->
            <div style="padding: 30px 40px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); text-align: center; border-top: 1px solid rgba(0, 255, 136, 0.1);">
              <div style="margin-bottom: 16px;">
                <span style="color: #ffffff; font-weight: 700; font-size: 18px;">Grind</span><span style="color: #00ff88; font-weight: 700; font-size: 18px;">fy</span>
              </div>
              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">© 2025 Grindfy - Plataforma de Analytics para Poker</p>
              <p style="margin: 0; color: #475569; font-size: 12px;">Este email foi enviado automaticamente, não responda.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  static getWelcomeEmailTemplate(firstName: string): string {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bem-vindo ao Grindfy!</title>
      </head>
      <body>
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
          <div style="max-width: 580px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
            
            <!-- Header com Logo + Marca (Mesmo do Email de Confirmação) -->
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 60px 40px; text-align: center; position: relative;">
              <!-- Logo Real do Grindfy -->
              <div style="display: inline-block; margin-bottom: 20px;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; background-color: rgba(15, 23, 42, 0.1); border-radius: 50%; border: 3px solid rgba(0, 255, 136, 0.3);">
                  <span style="color: #00ff88; font-size: 36px; font-weight: 900; font-family: 'Inter', sans-serif; line-height: 1; display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; text-align: center;">G</span>
                </div>
              </div>
              
              <!-- Marca Grindfy com Cores Corretas -->
              <h1 style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.02em;">
                <span style="color: #ffffff;">Grind</span><span style="color: #00ff88;">fy</span>
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.7); font-size: 16px; font-weight: 500;">Poker Analytics Platform</p>
            </div>

            <!-- Conteúdo Principal -->
            <div style="padding: 50px 40px; background-color: #1e293b;">
              
              <!-- Card de Boas-vindas -->
              <div style="background: linear-gradient(135deg, #334155 0%, #475569 100%); padding: 40px; border-radius: 12px; border: 1px solid rgba(0, 255, 136, 0.1); margin-bottom: 30px;">
                <h2 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 24px 0; text-align: center;">Conta verificada com sucesso!</h2>
                
                <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                  Parabéns! Sua conta no Grindfy foi verificada e está pronta para uso.
                </p>
                
                <p style="line-height: 1.7; margin: 0 0 24px 0; color: #cbd5e1; font-size: 16px; text-align: center;">
                  Agora você já tem acesso à plataforma.
                </p>
                
                <p style="line-height: 1.7; margin: 0 0 32px 0; color: #94a3b8; font-size: 15px; text-align: center;">
                  Comece a registrar seus torneios, analisar seu histórico e impulsione sua performance!
                </p>
                
                <!-- Botão Principal Grande -->
                <div style="text-align: center; margin: 40px 0;">
                  <a href="https://grindfy.app/dashboard" style="display: inline-block; background: linear-gradient(135deg, #00ff88 0%, #10b981 100%); color: #0f172a; text-decoration: none; padding: 20px 50px; border-radius: 12px; font-weight: 700; font-size: 18px; letter-spacing: 0.5px; transition: all 0.3s ease; box-shadow: 0 12px 30px rgba(0, 255, 136, 0.4);">
                    Acessar Grindfy
                  </a>
                </div>
              </div>

              <!-- Linha Separadora -->
              <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent); margin: 40px 0;"></div>
              
              <!-- Texto de Segurança -->
              <p style="line-height: 1.6; margin: 0; color: #64748b; font-size: 13px; text-align: center;">
                Se você não criou uma conta no Grindfy, pode ignorar este email com segurança. Nenhuma ação será tomada em sua conta.
              </p>
            </div>

            <!-- Footer (Idêntico ao Email de Confirmação) -->
            <div style="padding: 30px 40px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); text-align: center; border-top: 1px solid rgba(0, 255, 136, 0.1);">
              <div style="margin-bottom: 16px;">
                <span style="color: #ffffff; font-weight: 700; font-size: 18px;">Grind</span><span style="color: #00ff88; font-weight: 700; font-size: 18px;">fy</span>
              </div>
              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">© 2025 Grindfy - Plataforma de Analytics para Poker</p>
              <p style="margin: 0; color: #475569; font-size: 12px;">Este email foi enviado automaticamente, não responda.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

}

// Clean up expired tokens every 5 minutes
setInterval(() => {
  EmailService.cleanupExpiredTokens();
}, 5 * 60 * 1000);

export default EmailService;