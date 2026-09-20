import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { SupabaseJwksService } from './supabase-jwks.service';

@Module({
  controllers: [AuthController],
  providers: [SupabaseJwksService, AuthGuard, RolesGuard],
  exports: [SupabaseJwksService, AuthGuard, RolesGuard],
})
export class AuthModule {}
