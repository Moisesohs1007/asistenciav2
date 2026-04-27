# Simulador de consumo y costos (Supabase) — 7 días

Este módulo genera una simulación de uso para el proyecto actual y estima consumo/costo para Supabase por servicio (Database/API, Auth, Storage, Realtime, Edge Functions).

Incluye:
- Simulación de carga (bajo/medio/alto) por 7 días.
- Reporte detallado por día y consolidado semanal.
- Dashboard interactivo (HTML) con exportación a CSV/JSON/PDF.
- Predicción simple (tendencia) y recomendaciones automáticas.

## Requisitos
- Node.js (sin dependencias externas).

## Ejecutar la simulación (7 días)

```powershell
cd "C:\App Web\asistenciav2"
node .\cost_sim\simulate_week.js --scenario medio --plan pro
```

Esto crea un archivo en `cost_sim/out/` con el detalle por día/servicio.

Parámetros útiles:
- `--dbDiskGb <n>`: tamaño real de la base de datos (GB) para cálculo de disco.
- `--storageGbBase <n>`: almacenamiento real actual (GB) para sumar al delta semanal.
- `--start YYYY-MM-DD`: fuerza el inicio de la semana simulada.

## Abrir el dashboard

Opción 1 (servidor local incluido):

```powershell
cd "C:\App Web\asistenciav2"
node .\cost_sim\server.js
```

Luego abre `http://localhost:4173/` y carga el JSON generado (o usa “Cargar último”).

Opción 2 (sin servidor):
- Abre `cost_sim/dashboard.html` en el navegador y carga el JSON manualmente.

## Exportación
Desde el dashboard:
- JSON: descarga el dataset completo.
- CSV: descargas por tabla (resumen diario, desglose por servicio).
- PDF: genera un informe ejecutivo semanal (imprimible).

## Ajustar supuestos (para mayor precisión)
Edita:
- `cost_sim/workloads.json` (comportamiento del sistema, escenarios).
- `cost_sim/pricing.supabase.json` (cuotas y sobrecostos del plan).

Si necesitas que el estimador sea 1:1 con tu facturación, integra tus números reales del panel “Usage” como histórico en el dashboard.

## Medición real (auditoría en el navegador)
La app ahora puede registrar consumo real aproximado de llamadas Supabase (REST/Auth/Functions/Storage) y bytes (cuando es posible) durante tus pruebas.

En la pantalla Reportes:
- botón `📊 Uso` descarga un JSON diario con contadores.

Para una semana:
1) Cada día, descarga el JSON (o al final del día).
2) Guarda los JSON en una carpeta, por ejemplo: `cost_sim/audit/`.
3) Genera un reporte semanal con:

```powershell
cd "C:\App Web\asistenciav2"
node .\cost_sim\analyze_audit.js --in .\cost_sim\audit --plan free --mau 8 --dbDiskGb 0.044 --storageGbBase 0.001
```

El archivo generado es compatible con el dashboard (`node cost_sim/server.js` → “Cargar último”).
