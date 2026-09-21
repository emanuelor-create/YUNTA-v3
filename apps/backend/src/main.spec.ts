import { corsOrigins } from './main';

// main.ts importa AppModule (y con él el guard de auth, que trae `jose`, ESM que
// jest no parsea): se mockea, acá solo se prueba la lectura de CORS_ORIGIN.
jest.mock('./app.module', () => ({ AppModule: class {} }));

describe('corsOrigins', () => {
  it('en desarrollo, sin la variable, no restringe (undefined)', () => {
    expect(corsOrigins({ NODE_ENV: 'development' })).toBeUndefined();
    expect(corsOrigins({})).toBeUndefined();
  });

  it('separa por coma, recorta espacios y saca la barra final', () => {
    expect(corsOrigins({ CORS_ORIGIN: ' https://yunta.vercel.app/ , https://app.yunta.com ' })).toEqual([
      'https://yunta.vercel.app',
      'https://app.yunta.com',
    ]);
  });

  it('en producción sin la variable no arranca, y dice cuál falta', () => {
    expect(() => corsOrigins({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGIN es obligatoria/);
    expect(() => corsOrigins({ NODE_ENV: 'production', CORS_ORIGIN: ' , ' })).toThrow(/CORS_ORIGIN/);
  });

  it('en producción con la variable la usa', () => {
    expect(corsOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'https://yunta.vercel.app' })).toEqual(['https://yunta.vercel.app']);
  });
});
