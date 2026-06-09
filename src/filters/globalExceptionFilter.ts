import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const response = host.switchToHttp().getResponse();
    const data =
      exception instanceof HttpException
        ? (exception.getResponse() as {
            message: string;
          })
        : { message: 'Something went Wrong!' };
    return response.status(status).json({
      success: false,
      error: data.message,
    });
  }
}
