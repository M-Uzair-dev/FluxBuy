import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { join } from 'path';
import { readFileSync } from 'fs';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow('MAIL_HOST'),
      port: config.getOrThrow<number>('MAIL_PORT'),
      secure: false,
      auth: {
        user: config.getOrThrow('MAIL_USER'),
        pass: config.getOrThrow('MAIL_PASS'),
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string) {
    await this.transporter.sendMail({
      from: this.config.getOrThrow('MAIL_FROM'),
      to,
      subject,
      html,
    });
  }
  async sendVerificationEmail(token: string, email: string, name: string) {
    const url = `${this.config.getOrThrow('FRONTEND_URL')}/auth/verify-email?token=${token}`;
    const html = readFileSync(
      join(__dirname, 'templates/verify-email.html'),
      'utf-8',
    )
      .replace(/{{verificationUrl}}/g, url)
      .replace(/{{name}}/g, name);

    await this.sendEmail(email, 'Verify your email', html);
  }
  async sendResetEmail(name: string, email: string, token: string) {
    const url = `${this.config.getOrThrow('FRONTEND_URL')}/auth/reset-password?token=${token}`;
    const html = readFileSync(
      join(__dirname, 'templates/reset-password.html'),
      'utf-8',
    )
      .replace(/{{resetUrl}}/g, url)
      .replace(/{{name}}/g, name);

    await this.sendEmail(email, 'Reset your password', html);
  }
}
