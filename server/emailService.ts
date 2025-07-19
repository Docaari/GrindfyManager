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

  // Gmail SMTP Configuration
  private static getTransporter(): Transporter {
    if (!this.transporter) {
      const gmailUser = process.env.GMAIL_USER || 'admin@grindfyapp.com';
      const gmailPass = process.env.GMAIL_APP_PASSWORD || 'njux yugx lbbk qjbl';
      
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // STARTTLS
        auth: {
          user: gmailUser,
          pass: gmailPass
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
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';
      const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
      
      const htmlTemplate = this.getEmailVerificationTemplate(verificationUrl);
      
      const mailOptions = {
        from: {
          name: 'Grindfy',
          address: 'admin@grindfyapp.com'
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
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      
      const htmlTemplate = this.getPasswordResetTemplate(resetUrl);
      
      const mailOptions = {
        from: {
          name: 'Grindfy',
          address: 'admin@grindfyapp.com'
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
          name: 'Grindfy',
          address: 'admin@grindfyapp.com'
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
  private static getEmailVerificationTemplate(verificationUrl: string): string {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirme seu email - Grindfy</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #0f1419; }
            .container { max-width: 600px; margin: 0 auto; background-color: #1a1a1a; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 20px; text-align: center; }
            .logo { color: #fff; font-size: 32px; font-weight: bold; margin: 0; }
            .content { padding: 40px 20px; color: #e5e7eb; }
            .title { color: #fff; font-size: 24px; margin: 0 0 20px 0; }
            .text { line-height: 1.6; margin: 0 0 30px 0; color: #d1d5db; }
            .button { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #fff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .button:hover { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); }
            .footer { padding: 30px 20px; background-color: #111827; color: #9ca3af; text-align: center; font-size: 14px; }
            .divider { height: 1px; background: linear-gradient(90deg, transparent, #374151, transparent); margin: 30px 0; }
            @media (max-width: 600px) {
                .container { width: 100% !important; }
                .content { padding: 30px 15px; }
                .button { width: 100%; text-align: center; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="logo">🎯 Grindfy</h1>
            </div>
            <div class="content">
                <h2 class="title">Confirme seu email</h2>
                <p class="text">
                    Olá! Bem-vindo ao <strong>Grindfy</strong>, a plataforma definitiva para rastreamento de performance em torneios de poker.
                </p>
                <p class="text">
                    Para começar a usar todas as funcionalidades e proteger sua conta, precisamos confirmar seu endereço de email.
                </p>
                <div style="text-align: center;">
                    <a href="${verificationUrl}" class="button">✅ Confirmar Email</a>
                </div>
                <div class="divider"></div>
                <p class="text" style="font-size: 14px; color: #9ca3af;">
                    Se você não criou uma conta no Grindfy, pode ignorar este email com segurança.
                </p>
                <p class="text" style="font-size: 14px; color: #9ca3af;">
                    Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                    <span style="color: #dc2626; word-break: break-all;">${verificationUrl}</span>
                </p>
            </div>
            <div class="footer">
                <p>© 2025 Grindfy - Plataforma de Analytics para Poker</p>
                <p>Este email foi enviado automaticamente, não responda.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  private static getPasswordResetTemplate(resetUrl: string): string {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset de senha - Grindfy</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #0f1419; }
            .container { max-width: 600px; margin: 0 auto; background-color: #1a1a1a; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 20px; text-align: center; }
            .logo { color: #fff; font-size: 32px; font-weight: bold; margin: 0; }
            .content { padding: 40px 20px; color: #e5e7eb; }
            .title { color: #fff; font-size: 24px; margin: 0 0 20px 0; }
            .text { line-height: 1.6; margin: 0 0 30px 0; color: #d1d5db; }
            .button { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #fff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .button:hover { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); }
            .warning { background-color: #1f2937; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { padding: 30px 20px; background-color: #111827; color: #9ca3af; text-align: center; font-size: 14px; }
            .divider { height: 1px; background: linear-gradient(90deg, transparent, #374151, transparent); margin: 30px 0; }
            @media (max-width: 600px) {
                .container { width: 100% !important; }
                .content { padding: 30px 15px; }
                .button { width: 100%; text-align: center; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="logo">🎯 Grindfy</h1>
            </div>
            <div class="content">
                <h2 class="title">🔒 Reset de senha</h2>
                <p class="text">
                    Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Grindfy</strong>.
                </p>
                <p class="text">
                    Clique no botão abaixo para criar uma nova senha:
                </p>
                <div style="text-align: center;">
                    <a href="${resetUrl}" class="button">🔐 Redefinir Senha</a>
                </div>
                <div class="warning">
                    <p style="margin: 0; color: #f59e0b; font-weight: 600;">⚠️ Este link expira em 1 hora</p>
                    <p style="margin: 10px 0 0 0; color: #d1d5db; font-size: 14px;">
                        Por segurança, este link de reset só é válido por 60 minutos.
                    </p>
                </div>
                <div class="divider"></div>
                <p class="text" style="font-size: 14px; color: #9ca3af;">
                    Se você não solicitou este reset, pode ignorar este email com segurança. Sua senha não será alterada.
                </p>
                <p class="text" style="font-size: 14px; color: #9ca3af;">
                    Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                    <span style="color: #dc2626; word-break: break-all;">${resetUrl}</span>
                </p>
            </div>
            <div class="footer">
                <p>© 2025 Grindfy - Plataforma de Analytics para Poker</p>
                <p>Este email foi enviado automaticamente, não responda.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  private static getWelcomeEmailTemplate(firstName: string): string {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bem-vindo ao Grindfy!</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #0f1419; }
            .container { max-width: 600px; margin: 0 auto; background-color: #1a1a1a; }
            .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 40px 20px; text-align: center; }
            .logo { color: #fff; font-size: 32px; font-weight: bold; margin: 0; }
            .content { padding: 40px 20px; color: #e5e7eb; }
            .title { color: #fff; font-size: 24px; margin: 0 0 20px 0; }
            .text { line-height: 1.6; margin: 0 0 20px 0; color: #d1d5db; }
            .button { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #fff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .features { background-color: #111827; padding: 25px; border-radius: 8px; margin: 30px 0; }
            .feature { margin: 15px 0; display: flex; align-items: center; }
            .feature-icon { width: 24px; height: 24px; margin-right: 15px; font-size: 20px; }
            .footer { padding: 30px 20px; background-color: #111827; color: #9ca3af; text-align: center; font-size: 14px; }
            .divider { height: 1px; background: linear-gradient(90deg, transparent, #374151, transparent); margin: 30px 0; }
            @media (max-width: 600px) {
                .container { width: 100% !important; }
                .content { padding: 30px 15px; }
                .button { width: 100%; text-align: center; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="logo">🎯 Grindfy</h1>
                <p style="color: #fff; margin: 10px 0 0 0; font-size: 18px;">Bem-vindo, ${firstName}!</p>
            </div>
            <div class="content">
                <h2 class="title">🎉 Conta verificada com sucesso!</h2>
                <p class="text">
                    Parabéns! Sua conta no <strong>Grindfy</strong> foi verificada e está pronta para uso.
                </p>
                <p class="text">
                    Você agora tem acesso completo à plataforma mais avançada de analytics para poker. 
                    Comece a rastrear seus torneios e impulsione sua performance!
                </p>
                
                <div class="features">
                    <h3 style="color: #fff; margin: 0 0 20px 0;">🚀 O que você pode fazer agora:</h3>
                    <div class="feature">
                        <span class="feature-icon">📊</span>
                        <span>Dashboard com métricas em tempo real</span>
                    </div>
                    <div class="feature">
                        <span class="feature-icon">📈</span>
                        <span>Analytics avançado de performance</span>
                    </div>
                    <div class="feature">
                        <span class="feature-icon">🎯</span>
                        <span>Planejamento de sessões de grind</span>
                    </div>
                    <div class="feature">
                        <span class="feature-icon">🧠</span>
                        <span>Ferramentas de preparação mental</span>
                    </div>
                    <div class="feature">
                        <span class="feature-icon">📚</span>
                        <span>Sistema de estudos integrado</span>
                    </div>
                    <div class="feature">
                        <span class="feature-icon">⬆️</span>
                        <span>Import automático de históricos CSV</span>
                    </div>
                </div>

                <div style="text-align: center;">
                    <a href="https://grindfy.app/dashboard" class="button">🎯 Acessar Dashboard</a>
                </div>

                <div class="divider"></div>
                
                <p class="text" style="font-size: 14px; color: #9ca3af;">
                    <strong>Dica:</strong> Comece importando seu histórico de torneios na seção "Import" 
                    para ver suas métricas detalhadas imediatamente!
                </p>
            </div>
            <div class="footer">
                <p>© 2025 Grindfy - Plataforma de Analytics para Poker</p>
                <p>Precisa de ajuda? Acesse nossa documentação ou entre em contato.</p>
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