import { createParamDecorator, ExecutionContext } from '@nestjs/common';

const CurrentUserId = createParamDecorator(function currentUser(
  _,
  ctx: ExecutionContext,
) {
  const req = ctx.switchToHttp().getRequest();
  return req.user.id;
});
export default CurrentUserId;
