// Base de datos en la nube (Supabase) para sincronizar celular y compu.
// Si quedan vacíos, todo se guarda solo en el navegador de cada dispositivo.
// La "anon key" es pública por diseño: los datos quedan protegidos por el login
// y las reglas RLS de supabase.sql (cada usuario ve solo lo suyo).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
