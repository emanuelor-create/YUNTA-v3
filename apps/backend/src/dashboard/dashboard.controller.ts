import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/types';
import { DashboardService, parseTzOffset } from './dashboard.service';

/// Vista entre proyectos (README §2). Sin @ProjectRoles: el universo ("donde
/// sos miembro") lo resuelven las consultas, igual que GET /projects.
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Query('tzOffset') tzOffset?: string) {
    return this.dashboard.get(request.auth.userId, parseTzOffset(tzOffset));
  }
}
