jest.mock('./supabase-jwks.service', () => ({ SupabaseJwksService: class {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthenticatedRequest } from './types';

describe('AuthController — mi perfil', () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let controller: AuthController;
  const request = { auth: { userId: 'u1', email: 'e@x.com' } } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u1' }),
        update: jest.fn(async ({ data }: { data: { name: string } }) => ({ id: 'u1', name: data.name })),
      },
    };
    controller = new AuthController(prisma as unknown as PrismaService);
  });

  it('cambia el propio nombre, prolijo (sin espacios de más)', async () => {
    const result = await controller.updateMe(request, { name: '  Emanuel   Ortiz ' });

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'Emanuel Ortiz' } });
    expect(result.profile).toEqual({ id: 'u1', name: 'Emanuel Ortiz' });
  });

  it('solo toca al usuario de la sesión', async () => {
    await controller.updateMe(request, { name: 'Otro nombre' });
    expect(prisma.user.update.mock.calls[0][0].where).toEqual({ id: 'u1' });
  });

  it('rechaza nombres vacíos, de 1 letra, de más de 80 o que no son texto', async () => {
    await expect(controller.updateMe(request, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.updateMe(request, { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.updateMe(request, { name: 'E' })).rejects.toThrow('al menos 2');
    await expect(controller.updateMe(request, { name: 'x'.repeat(81) })).rejects.toThrow('hasta 80');
    await expect(controller.updateMe(request, { name: 42 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('sin perfil en la base es un 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(controller.updateMe(request, { name: 'Emanuel' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
