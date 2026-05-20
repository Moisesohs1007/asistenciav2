[OPEN] Debug Session: storage-rls-upload

## Context
- Feature: Subida masiva de fotos de alumnos a Supabase Storage (bucket `alumnos-fotos`)
- Symptom: Upload falla con `new row violates row-level security policy` desde el navegador (GitHub Pages)
- Expected: Subir a `alumnos-fotos/sigece/<dni>.jpg` y actualizar `public.alumnos.foto` con URL pública

## Hypotheses (falsifiable)
1) **Session/Token mismatch**: el request a Storage sale sin `Authorization: Bearer <access_token>` (o con token expirado) → RLS falla.
2) **Policy mismatch**: la policy INSERT/UPDATE/DELETE no coincide con `bucket_id`/`name` real (path distinto, mayúsculas, encoding) → RLS falla.
3) **Auth UID mismatch**: `auth.uid()` en Postgres no coincide con `usuarios.id` esperado (por login/usuario) → `can_upload_*` devuelve false.
4) **RLS precedence/conflict**: existen policies duplicadas o una policy más restrictiva prevalece y bloquea el insert/update.
5) **Endpoint method mismatch**: el cliente usa endpoint/método equivocado (POST vs PUT, `x-upsert`, headers) y Storage evalúa reglas distintas.

## Evidence to collect
- URL exacta de Storage + método HTTP + status code
- Headers enviados: Authorization/apikey/content-type/x-upsert
- Respuesta JSON/text de Storage (error message completo)
- Policies efectivas en `storage.objects` (`pg_policies`)
- UID/rol del usuario autenticado (solo UID/rol, sin secretos)

## Plan
1) Instrumentar `compat.js` para reportar eventos de upload a Debug Server (sin usar console.log).
2) Reproducir 1 upload desde “Subir fotos (masivo)”.
3) Analizar logs y confirmar/descartar hipótesis.
4) Implementar fix mínimo y re-probar.

