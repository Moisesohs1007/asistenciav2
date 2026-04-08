# Guía de Migración y Despliegue de la v2 (Supabase Auth y Seguridad)

Esta carpeta `v2/` contiene la versión refactorizada, segura e independiente de tu sistema de asistencia.

## 1. ¿Qué cambió?
- **Desacoplamiento visual y lógico:** El CSS y JS que antes estaban mezclados en los HTML ahora están en `css/` y `js/`.
- **Autenticación Nativa de Supabase:** Se eliminó la capa `compat.js` y `firebase`. Ahora usa la librería oficial de Supabase.
- **Backend Seguro para WhatsApp:** Se extrajo el token de Factiliza del lado del cliente y se movió a una Edge Function.
- **Políticas de Datos Estrictas:** Se escribió un nuevo `schema-v2.sql` que impide a los padres listar datos o acceder a la tabla de configuración global de colegios.

## 2. Pruebas de Regresión y Validación
Antes de lanzar esto a producción (es decir, reemplazar la URL principal), debes:

1. **Desplegar la Edge Function de WhatsApp:**
   Abre una terminal, loguéate en Supabase y ejecuta:
   ```bash
   supabase functions deploy enviar-whatsapp
   ```

2. **Ejecutar el nuevo Script SQL:**
   Ve al dashboard de Supabase (SQL Editor) y ejecuta el contenido de `supabase/schema-v2.sql`.

3. **Prueba en Local:**
   Abre `v2/index.html` con Live Server.
   - [ ] Valida el Login del Administrador.
   - [ ] Valida el escaneo de un código QR.
   - [ ] Entra a `v2/apoderado.html`. Valida el Login de un padre (DNI).
   - [ ] Verifica que el historial de asistencias cargue.
   - [ ] Cambia los datos del padre y verifica que llegue el WhatsApp.

## 3. Despliegue en GitHub
Como tu proyecto se aloja en GitHub, tienes dos opciones:

**Opción A: Reemplazo Total (Recomendado)**
1. Haz una copia de seguridad de tu carpeta principal actual.
2. Elimina los archivos viejos (`index.html`, `apoderado.html`, `sw.js`, `manifest.json`, `compat.js`, `db.js`, `db_supabase.js`).
3. Mueve todo el contenido de la carpeta `v2/` a la raíz de tu proyecto.
4. Haz commit y push.

**Opción B: Despliegue Paralelo**
1. Simplemente haz commit y push de esta carpeta `v2/`.
2. Podrás acceder a tu nuevo sistema en: `https://<tu-usuario>.github.io/<tu-repo>/v2/`.
3. Esto te permite tener la versión vieja y la nueva corriendo al mismo tiempo para hacer pruebas en vivo sin afectar el sistema actual.
