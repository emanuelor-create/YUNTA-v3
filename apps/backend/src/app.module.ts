import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CardsModule } from './cards/cards.module';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { ProjectsModule } from './projects/projects.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [ScheduleModule.forRoot(), SnapshotsModule, PrismaModule, CardsModule, AuthModule, BoardsModule, ProjectsModule, UsersModule, DashboardModule],
  controllers: [HealthController],
})
export class AppModule {}
