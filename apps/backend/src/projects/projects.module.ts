import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ProjectMembersController } from './project-members.controller';
import { ProjectMembersService } from './project-members.service';
import { ProjectCreationService } from './project-creation.service';
import { ProjectSettingsService } from './project-settings.service';
import { ProjectsController } from './projects.controller';
import { ProjectsListController } from './projects-list.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule, SupabaseModule, ActivityModule],
  controllers: [ProjectsListController, ProjectsController, ProjectMembersController],
  providers: [ProjectsService, ProjectMembersService, ProjectSettingsService, ProjectCreationService],
  exports: [ProjectsService, ProjectMembersService],
})
export class ProjectsModule {}
