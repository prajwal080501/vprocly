import { Module } from '@nestjs/common';
import { VoiceOutreachController } from './voice-outreach.controller.js';
import { VoiceOutreachService } from './voice-outreach.service.js';

@Module({ controllers: [VoiceOutreachController], providers: [VoiceOutreachService] })
export class VoiceOutreachModule {}
