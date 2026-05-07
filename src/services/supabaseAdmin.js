import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

// El cliente admin usa la Service Role Key para operaciones privilegiadas
// (crear usuarios, cambiar contraseñas de otros, banear cuentas).
// Solo úsalo en herramientas internas — nunca expongas esta clave en apps públicas.
export const supabaseAdmin =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export function verificarAdmin() {
  if (!supabaseAdmin) {
    throw new Error(
      "VITE_SUPABASE_SERVICE_KEY no está configurada. Agrega tu Service Role Key al archivo .env para gestionar usuarios."
    );
  }
}
