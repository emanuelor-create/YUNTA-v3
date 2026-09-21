import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/// Orígenes del front permitidos, separados por coma (CORS_ORIGIN). En
/// desarrollo, sin la variable, se permite cualquiera. En producción es
/// obligatoria: arrancar abierto por olvido es peor que no arrancar.
export function corsOrigins(env: NodeJS.ProcessEnv): string[] | undefined {
  const origins = (env.CORS_ORIGIN ?? '')
    .split(',')
    // Sin la barra final: el navegador manda el origen sin ella y no coinciden.
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (origins.length) return origins;
  if (env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN es obligatoria en producción (ej.: https://yunta.vercel.app)');
  }
  return undefined;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origin = corsOrigins(process.env);
  app.enableCors(origin ? { origin } : undefined);
  await app.listen(process.env.PORT ?? 3000);
}

// Solo arranca al ejecutarse directamente (node dist/main.js), no al importarlo desde un test.
if (require.main === module) bootstrap();
