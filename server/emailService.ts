import { z } from 'zod';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

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

  // Send email verification (mock implementation)
  static async sendEmailVerification(email: string, token: string): Promise<boolean> {
    try {
      // In production, integrate with email service provider (SendGrid, Mailgun, etc.)
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
      
      console.log(`📧 EMAIL VERIFICATION - Mock Email Sent to: ${email}`);
      console.log(`🔗 Verification URL: ${verificationUrl}`);
      console.log(`📝 Token: ${token}`);
      
      // Mock successful email send
      return true;
    } catch (error) {
      console.error('Error sending email verification:', error);
      return false;
    }
  }

  // Send password reset email (mock implementation)
  static async sendPasswordReset(email: string, token: string): Promise<boolean> {
    try {
      // In production, integrate with email service provider
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
      
      console.log(`📧 PASSWORD RESET - Mock Email Sent to: ${email}`);
      console.log(`🔗 Reset URL: ${resetUrl}`);
      console.log(`📝 Token: ${token}`);
      
      // Mock successful email send
      return true;
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return false;
    }
  }

  // Verify user email
  static async verifyUserEmail(token: string): Promise<boolean> {
    try {
      const tokenData = this.verifyEmailToken(token);
      if (!tokenData) {
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

      return true;
    } catch (error) {
      console.error('Error verifying user email:', error);
      return false;
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
}

// Clean up expired tokens every 5 minutes
setInterval(() => {
  EmailService.cleanupExpiredTokens();
}, 5 * 60 * 1000);

export default EmailService;