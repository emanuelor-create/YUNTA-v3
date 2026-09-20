import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectCreationService } from './project-creation.service';
import { deriveProjectKey, firstFreeKey } from './project-key';

const CREATOR = 'user-1';

describe('deriveProjectKey / firstFreeKey', () => {
  it('toma las 3 primeras letras, sin acentos y en mayúsculas', () => {
    expect(deriveProjectKey('Rediseño del sitio web')).toBe('RED');
    expect(deriveProjectKey('Migración de la nube')).toBe('MIG');
    expect(deriveProjectKey('App móvil')).toBe('APP');
    expect(deriveProjectKey('Ñandú Corp')).toBe('NAN');
  });

  it('ignora números y símbolos; con menos de 3 letras usa las que haya; sin letras, PRJ', () => {
    expect(deriveProjectKey('2026 – Q3')).toBe('Q');
    expect(deriveProjectKey('A1B2')).toBe('AB');
    expect(deriveProjectKey('12345')).toBe('PRJ');
  });

  it('la primera clave libre: RED, RED2, RED3…', () => {
    expect(firstFreeKey('RED', [])).toBe('RED');
    expect(firstFreeKey('RED', ['RED'])).toBe('RED2');
    expect(firstFreeKey('RED', ['RED', 'RED2', 'REDONDO'])).toBe('RED3');
    expect(firstFreeKey('RED', ['RED2'])).toBe('RED'); // el hueco se reusa
  });
});

describe('ProjectCreationService', () => {
  let prisma: { project: { count: jest.Mock; findMany: jest.Mock; create: jest.Mock } };
  let activityLog: { log: jest.Mock };
  let service: ProjectCreationService;

  beforeEach(() => {
    prisma = {
      project: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async ({ data }) => ({ id: 'proj-new', key: data.key, name: data.name })),
      },
    };
    activityLog = { log: jest.fn() };
    service = new ProjectCreationService(prisma as unknown as PrismaService, activityLog as unknown as ActivityLogService);
  });

  it('crea proyecto + tablero con las cuatro columnas por defecto + el creador como OWNER, en una sola escritura', async () => {
    const result = await service.create({ name: '  Sitio nuevo  ', client: 'Acme', description: 'Resumen', color: '#b4552f' }, CREATOR);

    expect(result).toEqual({ id: 'proj-new', key: 'SIT', name: 'Sitio nuevo' });
    expect(prisma.project.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.project.create.mock.calls[0][0];
    expect(data.name).toBe('Sitio nuevo');
    expect(data.members).toEqual({ create: { userId: CREATOR, role: 'OWNER' } });
    expect(data.board.create.columns.create).toEqual([
      { name: 'Por hacer', position: 0 },
      { name: 'En curso', position: 1 },
      { name: 'En revisión', position: 2 },
      { name: 'Hecho', position: 3 },
    ]);
    expect(activityLog.log).toHaveBeenCalledWith({ projectId: 'proj-new', userId: CREATOR, type: 'PROJECT_CREATED', message: 'creó el proyecto' });
  });

  it('el nombre es obligatorio y tiene tope', async () => {
    await expect(service.create({ name: '   ' }, CREATOR)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({}, CREATOR)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'x'.repeat(121) }, CREATOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('cliente y resumen vacíos se guardan como null; las fechas se parsean', async () => {
    await service.create({ name: 'Algo', client: '  ', description: '', startDate: '2026-10-01', endDate: '2026-12-01' }, CREATOR);
    const { data } = prisma.project.create.mock.calls[0][0];
    expect(data.client).toBeNull();
    expect(data.description).toBeNull();
    expect(data.startDate).toEqual(new Date('2026-10-01'));
    expect(data.endDate).toEqual(new Date('2026-12-01'));
  });

  it('rechaza un fin anterior al inicio y una fecha inválida', async () => {
    await expect(service.create({ name: 'A', startDate: '2026-12-01', endDate: '2026-10-01' }, CREATOR)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'A', endDate: 'ayer' }, CREATOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el color tiene que ser de la paleta; sin color se reparte por la paleta según cuántos proyectos hay', async () => {
    await expect(service.create({ name: 'A', color: '#ff00ff' }, CREATOR)).rejects.toBeInstanceOf(BadRequestException);

    prisma.project.count.mockResolvedValue(7); // 7 % 5 = 2
    await service.create({ name: 'Sin color' }, CREATOR);
    expect(prisma.project.create.mock.calls[0][0].data.color).toBe('#8a5a2b');
  });

  it('si el prefijo ya existe, la clave es la siguiente libre (RED2)', async () => {
    prisma.project.findMany.mockResolvedValue([{ key: 'RED' }]);
    const result = await service.create({ name: 'Rediseño 2' }, CREATOR);
    expect(result.key).toBe('RED2');
  });

  it('si dos altas simultáneas chocan en la clave, reintenta con la siguiente', async () => {
    const clash = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
    prisma.project.create
      .mockRejectedValueOnce(clash)
      .mockImplementationOnce(async ({ data }) => ({ id: 'proj-new', key: data.key, name: data.name }));
    prisma.project.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ key: 'RED' }]);

    const result = await service.create({ name: 'Rediseño' }, CREATOR);

    expect(prisma.project.create).toHaveBeenCalledTimes(2);
    expect(result.key).toBe('RED2');
  });

  it('un error que no es de clave repetida se propaga; y tras 3 choques se rinde con 409', async () => {
    prisma.project.create.mockRejectedValueOnce(new Error('base caída'));
    await expect(service.create({ name: 'A' }, CREATOR)).rejects.toThrow('base caída');

    const clash = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
    prisma.project.create.mockRejectedValue(clash);
    await expect(service.create({ name: 'A' }, CREATOR)).rejects.toBeInstanceOf(ConflictException);
  });
});
