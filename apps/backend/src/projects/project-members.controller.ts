import { BadRequestException, Body, Controller, Delete, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { ProjectRoles } from '../auth/project-roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/types';
import { ProjectMembersService } from './project-members.service';

interface AddMemberBody {
  email?: string;
  role?: ProjectRole;
}

interface UpdateMemberRoleBody {
  role?: ProjectRole;
}

/// Las tres acciones de "Personas" en Proyecto → Resumen (README.md §4):
/// invitar, cambiar rol, quitar. Todas requieren OWNER del proyecto.
@Controller('projects/:projectId/members')
@UseGuards(AuthGuard, RolesGuard)
@ProjectRoles(ProjectRole.OWNER)
export class ProjectMembersController {
  constructor(private readonly members: ProjectMembersService) {}

  @Post()
  addMember(@Param('projectId') projectId: string, @Body() body: AddMemberBody, @Req() request: AuthenticatedRequest) {
    if (!body.email?.trim()) {
      throw new BadRequestException('email es requerido');
    }
    if (!body.role) {
      throw new BadRequestException('role es requerido');
    }
    return this.members.addMember(projectId, body.email.trim(), body.role, request.auth.userId);
  }

  @Patch(':userId')
  updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() body: UpdateMemberRoleBody,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body.role) {
      throw new BadRequestException('role es requerido');
    }
    return this.members.updateMemberRole(projectId, userId, body.role, request.auth.userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.members.removeMember(projectId, userId, request.auth.userId);
  }
}
