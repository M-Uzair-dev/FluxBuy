import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '../token/token.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedException('No token provided');

    try {
      const payload = this.tokenService.verifyJwt(token);
      if (payload.type !== 'access')
        throw new UnauthorizedException(
          'Invalid Token! Please provide the access token.',
        );
      request.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Token expired or invalid');
    }
  }
}
