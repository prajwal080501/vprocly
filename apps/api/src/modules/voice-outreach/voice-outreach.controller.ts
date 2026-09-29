import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Public } from '../identity-tenancy/index.js';
import { VoiceOutreachService } from './voice-outreach.service.js';

@Controller('webhooks/sarvam')
export class VoiceOutreachController {
  constructor(private readonly service: VoiceOutreachService) {}

  @Post('instant-outbound/:secret')
  @HttpCode(200)
  @Public()
  webhook(@Param('secret') secret: string, @Body() body: unknown) {
    return this.service.handleSarvamWebhook(secret, body);
  }
}
