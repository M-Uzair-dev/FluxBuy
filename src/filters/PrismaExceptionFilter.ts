import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorMap: Record<string, { status: HttpStatus; message: string }> = {
      P2025: { status: HttpStatus.NOT_FOUND, message: 'Record not found' },
      P2002: {
        status: HttpStatus.CONFLICT,
        message: 'Unique constraint violation',
      },
      P2003: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Foreign key constraint failed',
      },
      P2000: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Value too long for field',
      },
    };

    const mapped = errorMap[exception.code] ?? {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Database error',
    };

    response.status(mapped.status).json({
      success: false,
      error: mapped.message,
    });
  }
}
