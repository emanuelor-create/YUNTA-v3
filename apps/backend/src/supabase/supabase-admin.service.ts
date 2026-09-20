import { Injectable, InternalServerErrorException } from '@nestjs/common';

/// Llamadas a la Admin API / Auth API de Supabase que necesitan la
/// service_role key. Nunca la expone al front; vive solo acá.
@Injectable()
export class SupabaseAdminService {
  private readonly baseUrl = process.env.SUPABASE_URL;
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  async updateAuthUser(authUserId: string, patch: { email?: string; password?: string }): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/v1/admin/users/${authUserId}`, {
      method: 'PUT',
      headers: this.adminHeaders(),
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      throw new InternalServerErrorException(
        `No se pudo actualizar el usuario en Supabase Auth: ${response.status} ${await response.text()}`,
      );
    }
  }

  /// POST /auth/v1/invite: crea el usuario en auth.users (sin contraseña,
  /// email_confirmed_at null) y le manda el mail de invitación. El trigger de
  /// auth.users (paso 4) lo sincroniza a public."User" en PENDING — corre
  /// dentro de la misma transacción, así que al volver esta llamada el perfil
  /// ya existe. Devuelve el id de auth.users (= el id de nuestro User).
  async inviteUserByEmail(email: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: this.adminHeaders(),
      body: JSON.stringify({ email }),
    });
    const json = await response.json();
    if (!response.ok) {
      throw new InternalServerErrorException(
        `No se pudo invitar al usuario en Supabase Auth: ${response.status} ${JSON.stringify(json)}`,
      );
    }
    return json.id;
  }

  /// POST /auth/v1/recover: dispara el mail de "restablecer contraseña" con
  /// el proveedor de correo configurado en el proyecto de Supabase.
  async sendPasswordRecoveryEmail(email: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: { apikey: this.serviceKey ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      throw new InternalServerErrorException(
        `No se pudo enviar el correo de recuperación: ${response.status} ${await response.text()}`,
      );
    }
  }

  private adminHeaders() {
    return {
      apikey: this.serviceKey ?? '',
      Authorization: `Bearer ${this.serviceKey}`,
      'Content-Type': 'application/json',
    };
  }
}
