# Backend de YUNTA (NestJS + Prisma). Contexto de build: la RAÍZ del monorepo,
# porque el package-lock.json es único y cubre los workspaces.
#
# Node >= 22.12 (engines de apps/backend): la imagen 22 trae la última 22.x.
FROM node:22-bookworm-slim

# Prisma necesita OpenSSL en tiempo de ejecución; la imagen slim no lo trae.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primero (capa cacheable). Se copian los package.json de todos los
# workspaces porque `npm ci` valida el lockfile contra ellos, pero solo se
# instalan las del backend.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci --workspace=apps/backend --include-workspace-root

COPY apps/backend apps/backend
WORKDIR /app/apps/backend
RUN npx prisma generate && npm run build

# Se deja NODE_ENV=production recién ahora: `npm ci` de arriba necesita las
# devDependencies (nest, typescript, prisma) para compilar y para migrar.
ENV NODE_ENV=production
# La plataforma inyecta PORT; 3000 es solo el valor por defecto de main.ts.
EXPOSE 3000

# Sin advisory lock de Prisma: detrás del pooler de Supabase (Supavisor) una
# sesión de migración cortada a medias deja el lock tomado en una conexión
# huérfana, y todos los arranques siguientes se cuelgan 10 s y fallan (P1002).
# Se probó contra esta base. Es seguro porque hay UNA sola réplica (railway.json):
# el lock solo protege de dos `migrate deploy` simultáneos.
ENV PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1

# Migra y arranca. `migrate deploy` aplica solo lo pendiente y usa DIRECT_URL;
# si una migración falla el servicio no arranca (se ve en el deploy, no a medianoche).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
