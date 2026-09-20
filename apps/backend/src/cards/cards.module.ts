import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { BoardCardsController } from './board-cards.controller';
import { CardAttachmentsController } from './card-attachments.controller';
import { CardAttachmentsService } from './card-attachments.service';
import { CardsController } from './cards.controller';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CardsService } from './cards.service';

@Module({
  imports: [AuthModule, SupabaseModule, ActivityModule],
  controllers: [CardsController, BoardCardsController, CardAttachmentsController, CommentsController],
  providers: [CardsService, CardAttachmentsService, CommentsService],
  exports: [CardsService, CardAttachmentsService],
})
export class CardsModule {}
