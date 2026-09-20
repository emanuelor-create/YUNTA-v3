import { ActivityLogService } from './activity-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityLogService', () => {
  let prisma: { activityLog: { create: jest.Mock; findMany: jest.Mock } };
  let service: ActivityLogService;

  beforeEach(() => {
    prisma = { activityLog: { create: jest.fn(), findMany: jest.fn() } };
    service = new ActivityLogService(prisma as unknown as PrismaService);
  });

  it('log escribe la entrada tal cual', async () => {
    const entry = {
      projectId: 'proj-1',
      userId: 'user-1',
      type: 'CARD_MOVED' as const,
      message: 'movió la tarjeta a "Hecho"',
      cardId: 'card-1',
      cardTitle: 'Tarjeta X',
    };

    await service.log(entry);

    expect(prisma.activityLog.create).toHaveBeenCalledWith({ data: entry });
  });

  it('recent trae las últimas N, más nuevas primero, con el autor', async () => {
    prisma.activityLog.findMany.mockResolvedValue([]);

    await service.recent('proj-1', 5);

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'proj-1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    );
  });

  it('recent usa 5 como límite por default', async () => {
    prisma.activityLog.findMany.mockResolvedValue([]);

    await service.recent('proj-1');

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });
});
