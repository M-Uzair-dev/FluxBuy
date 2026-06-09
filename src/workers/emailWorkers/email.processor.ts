import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EmailService } from '../../email/email.service';

@Processor('email', {
  concurrency: 10,
})
export class EmailProcessor extends WorkerHost {
  constructor(private readonly emailService: EmailService) {
    super();
  }
  async process(job: Job) {
    switch (job.name) {
      case 'send-verification':
        await this.handleVerificationEmail(job.data);
        break;
      case 'send-reset':
        await this.handleResetEmail(job.data);
        break;
    }
  }

  private async handleVerificationEmail(data: {
    token: string;
    name: string;
    email: string;
  }) {
    await this.emailService.sendVerificationEmail(
      data.token,
      data.email,
      data.name,
    );
  }

  private async handleResetEmail(data: {
    name: string;
    email: string;
    token: string;
  }) {
    await this.emailService.sendResetEmail(data.name, data.email, data.token);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    console.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    console.error(`Job ${job.id} failed: ${error.message}`);
  }
}
