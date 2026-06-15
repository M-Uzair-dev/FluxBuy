import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verifyEmail.dto';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { ResetPasswordQueryDto } from './dto/resetPasswordQuery.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Throttle } from '@nestjs/throttler';
import { GoogleAuthGuard } from '../guards/google.guard';
import { getTokensDto } from './dto/getTokens.dto';
import type { Response } from 'express';

@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  login(@Body() data: LoginDto) {
    return this.authService.localLogin(data.email, data.password);
  }

  @Post('/signup')
  signup(@Body() data: SignupDto) {
    return this.authService.localSignup(data.name, data.email, data.password);
  }

  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Get('/verifyEmail')
  verifyEmail(@Query() data: VerifyEmailDto) {
    return this.authService.verifyEmail(data.token);
  }
  @Post('/forgot-password')
  forgotPassword(@Query() data: ForgotPasswordDto) {
    return this.authService.forgotPassword(data.email);
  }
  @Post('/resetPassword')
  resetPassword(
    @Body() data: ResetPasswordDto,
    @Query() queryData: ResetPasswordQueryDto,
  ) {
    return this.authService.resetPassword(queryData.token, data.newPassword);
  }
  @Post('/rotate')
  rotateTokens(@Body() data: RefreshDto) {
    return this.authService.refreshTokens(data.refreshToken);
  }
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Request() req: any, @Res() res: Response) {
    const redirectUri = await this.authService.googleLogin(req.user);
    res.redirect(redirectUri);
  }
  @Get('/tokens/:uid')
  getTokens(@Param() data: getTokensDto) {
    return this.authService.getTokens(data.uid);
  }
}
