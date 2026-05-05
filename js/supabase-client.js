// v2/js/supabase-client.js
// Configuración y conexión directa a Supabase

const SUPABASE_URL = 'https://bqnhlzwdibcmstqzspmj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxbmhsendkaWJjbXN0cXpzcG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODY2MTAsImV4cCI6MjA5MDY2MjYxMH0.mm7eMEOMzylzKeWJbcI_gHaHbwnGpQo0UVhZUOB9q2s';

window.COLEGIO_ID = 'sigece';
window.COLEGIO_NOMBRE  = 'I.E. Nº 1049 Juana Alarco De Dammert';
window.COLEGIO_ESLOGAN = '';
window.COLEGIO_LOGO    = 'img/logo-colegio.png';
window.COLEGIO_ANIO    = '2026';

// Inicializar Supabase de forma nativa
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: 'v2_auth_' + window.COLEGIO_ID }
});
