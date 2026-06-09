import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../guards/jwt.guard';
import CurrentUserId from '../decorators/currentUser.decorator';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @UseGuards(JwtGuard)
  @Get('/me')
  getMe(@CurrentUserId() id: string) {
    const user = this.userService.getUserFromId(id);
    if (!user) throw new NotFoundException('User Not Found!');
    return user;
  }
}
