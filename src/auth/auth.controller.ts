import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verifyEmail.dto';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { ResetPasswordQueryDto } from './dto/resetPasswordQuery.dto';

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
}
