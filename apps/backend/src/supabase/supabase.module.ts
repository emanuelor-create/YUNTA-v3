import { Module } from '@nestjs/common';
import { SupabaseAdminService } from './supabase-admin.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  providers: [SupabaseAdminService, SupabaseStorageService],
  exports: [SupabaseAdminService, SupabaseStorageService],
})
export class SupabaseModule {}
