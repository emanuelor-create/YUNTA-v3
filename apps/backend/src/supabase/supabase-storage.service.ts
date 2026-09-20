import { Injectable, InternalServerErrorException } from '@nestjs/common';

const BUCKET = 'card-attachments';

/// Cada segmento de la ruta escapado: aunque las claves ya son ASCII seguras,
/// un "?" o "#" que llegara acá cambiaría la URL en vez de nombrar el archivo.
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const SIGNED_URL_EXPIRES_IN_SECONDS = 60;

/// Adjuntos en Supabase Storage (ARCHITECTURE.md §8): bucket privado,
/// service_role únicamente. El front nunca sube directo ni tiene la anon
/// key con permiso sobre este bucket — todo pasa por la API.
@Injectable()
export class SupabaseStorageService {
  private readonly baseUrl = process.env.SUPABASE_URL;
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  async upload(path: string, file: Buffer, contentType: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/${BUCKET}/${encodePath(path)}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': contentType || 'application/octet-stream',
      },
      body: new Uint8Array(file),
    });
    if (!response.ok) {
      throw new InternalServerErrorException(
        `No se pudo subir el archivo a Supabase Storage: ${response.status} ${await response.text()}`,
      );
    }
  }

  /// URL de descarga de corta duración (60s): se genera al pedirla, nunca
  /// se guarda — para entonces ya expiró si no se usó.
  ///
  /// Con `downloadName`, la URL hace que el navegador guarde el archivo con ese
  /// nombre (Content-Disposition) en vez de la clave interna.
  async createSignedUrl(path: string, downloadName?: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/sign/${BUCKET}/${encodePath(path)}`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS }),
    });
    const json = await response.json();
    if (!response.ok) {
      throw new InternalServerErrorException(
        `No se pudo firmar la URL de descarga: ${response.status} ${JSON.stringify(json)}`,
      );
    }
    const url = `${this.baseUrl}/storage/v1${json.signedURL}`;
    return downloadName ? `${url}&download=${encodeURIComponent(downloadName)}` : url;
  }

  async remove(path: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    });
    if (!response.ok) {
      throw new InternalServerErrorException(
        `No se pudo borrar el archivo de Supabase Storage: ${response.status} ${await response.text()}`,
      );
    }
  }

  private authHeaders() {
    return {
      apikey: this.serviceKey ?? '',
      Authorization: `Bearer ${this.serviceKey}`,
    };
  }
}
