import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { BoardsController } from './boards.controller';
import { ColumnsService } from './columns.service';

@Module({
  imports: [AuthModule, ActivityModule],
  controllers: [BoardsController],
  providers: [ColumnsService],
  exports: [ColumnsService],
})
export class BoardsModule {}
