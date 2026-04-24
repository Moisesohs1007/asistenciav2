# Sistema de horarios (sin IA externa)

## Objetivo
Generar horarios semanales válidos y escalables para Inicial/Primaria/Secundaria, con soporte multi-local, restricciones duras (hard) y criterios de optimización (soft), con historial de ejecuciones y recuperación.

## Componentes
- Base de datos (Postgres/Supabase): catálogos, demanda, jornada (slots), eventos fijos, ejecuciones (runs) y resultados.
- Backend (Supabase Edge Functions): generación, validación, persistencia y exportación.
- Frontend: captura manual guiada, validación inmediata y visualización/export.

## Modelo de datos (resumen)
- `horario_locales`, `horario_travel_times`
- `horario_rooms`
- `horario_courses`
- `horario_sections`
- `horario_teachers`, `horario_teacher_availability`
- `horario_slots` (jornada)
- `horario_demands` (carga por sección/curso/docente)
- `horario_events` (bloqueos institucionales)
- `horario_runs` (snapshot de entradas/salidas)
- `horario_items` (asignaciones por slot)

## Flujo operativo
1. Definir jornada: `horario_slots` (día/slot + inicio/fin + recesos como `is_break=true`).
2. Registrar estructura: secciones, cursos, docentes, locales, aulas.
3. Registrar disponibilidad docente (slots permitidos) y eventos fijos.
4. Definir demanda (horas/semana por sección/curso y docente asignado).
5. Ejecutar generación:
   - Edge Function `generar-horario` crea un `horario_run` y genera `horario_items`.
6. Revisar y ajustar:
   - si `failed`, usar `unassigned` y métricas para corregir (más disponibilidad, menos horas, reasignar docente).
7. Exportar/Versionar:
   - cada ejecución queda guardada; se puede recuperar un run previo.

## Restricciones soportadas (actual)
- No choques de docente.
- No choques dentro de sección.
- Respeto de recesos (break slots).
- Respeto de disponibilidad docente por slots.
- Máximo de horas consecutivas del mismo curso por sección.
- Regla básica de traslado/local: evita clases consecutivas con cambio de local (y preferencia opcional de “un local por día”).
- Bloqueos por eventos (global, por sección o por docente).

## Extensiones previstas
- Asignación y disponibilidad de aulas (`horario_rooms`) con capacidad y tipos (laboratorio/taller).
- Contratos por docente (máximo por día, ventanas, descansos).
- Optimización multi-objetivo (gaps, traslados, balance por semana, preferencia docente).
- Validación en tiempo real en UI y sugerencias de reparación.
- Suite de pruebas de escenarios reales y casos límite.

## Despliegue
- Ejecutar en Supabase SQL Editor: `supabase/horarios_schema.sql`.
- Desplegar Edge Function: `supabase/functions/generar-horario`.

