-- AlterEnum
-- Configuración del proyecto (editar, archivar/desarchivar) y reorden de
-- columnas en la "Actividad reciente". Cada ADD VALUE va en su propia
-- sentencia: Postgres no deja usar el valor nuevo dentro de la misma
-- transacción que lo crea, y acá solo se declara.
ALTER TYPE "ActivityType" ADD VALUE 'COLUMN_REORDERED';
ALTER TYPE "ActivityType" ADD VALUE 'PROJECT_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'PROJECT_ARCHIVED';
ALTER TYPE "ActivityType" ADD VALUE 'PROJECT_UNARCHIVED';
