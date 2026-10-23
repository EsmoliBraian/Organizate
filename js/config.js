// Base de datos en la nube (Supabase) para sincronizar celular y compu.
// Si quedan vacíos, todo se guarda solo en el navegador de cada dispositivo.
// La "anon key" es pública por diseño: los datos quedan protegidos por el login
// y las reglas RLS de supabase.sql (cada usuario ve solo lo suyo).
export const SUPABASE_URL = 'https://zyupfnddbtokcwvuofds.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dXBmbmRkYnRva2N3dnVvZmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NjE3OTIsImV4cCI6MjEwODMzNzc5Mn0.mYD4BJZ0WK3ANOPxBLSjFDDodVMr1k9T52XOgbfPrCQ';
