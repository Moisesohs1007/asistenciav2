import { solveTimetable } from './solver.ts';

Deno.test('solveTimetable genera sin choques de docente en caso simple', () => {
  const model = {
    colegio_id: 'sigece',
    jornadas: [{ id: 'DEFAULT', compare_group: 'DEFAULT' }],
    slots: [
      { jornada_id: 'DEFAULT', day: 'Lun', slot: 1, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Lun', slot: 2, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Lun', slot: 3, is_break: true },
      { jornada_id: 'DEFAULT', day: 'Lun', slot: 4, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Mar', slot: 1, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Mar', slot: 2, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Mar', slot: 3, is_break: true },
      { jornada_id: 'DEFAULT', day: 'Mar', slot: 4, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Mie', slot: 1, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Mie', slot: 2, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Mie', slot: 3, is_break: true },
      { jornada_id: 'DEFAULT', day: 'Mie', slot: 4, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Jue', slot: 1, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Jue', slot: 2, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Jue', slot: 3, is_break: true },
      { jornada_id: 'DEFAULT', day: 'Jue', slot: 4, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Vie', slot: 1, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Vie', slot: 2, is_break: false },
      { jornada_id: 'DEFAULT', day: 'Vie', slot: 3, is_break: true },
      { jornada_id: 'DEFAULT', day: 'Vie', slot: 4, is_break: false },
    ],
    travel_minutes_between_locals: 0,
    max_consecutive_same_course: 2,
    sections: [
      { id: 'PRI-1A', local_base: 'A', jornada_id: 'DEFAULT' },
      { id: 'PRI-1B', local_base: 'A', jornada_id: 'DEFAULT' },
    ],
    teachers: [
      { id: 'D1', availability: { Lun: [1, 2, 4], Mar: [1, 2, 4], Mie: [1, 2, 4], Jue: [1, 2, 4], Vie: [1, 2, 4] } },
      { id: 'D2', availability: { Lun: [1, 2, 4], Mar: [1, 2, 4], Mie: [1, 2, 4], Jue: [1, 2, 4], Vie: [1, 2, 4] } },
    ],
    demands: [
      { section_id: 'PRI-1A', course_id: 'MAT', teacher_id: 'D1', hours_per_week: 2 },
      { section_id: 'PRI-1B', course_id: 'MAT', teacher_id: 'D1', hours_per_week: 2 },
      { section_id: 'PRI-1A', course_id: 'COM', teacher_id: 'D2', hours_per_week: 2 },
      { section_id: 'PRI-1B', course_id: 'COM', teacher_id: 'D2', hours_per_week: 2 },
    ],
    locals: [{ id: 'A' }],
    travel: {},
    events: [],
  };

  const res = solveTimetable(model as any, { attempts: 20, seed: 123 });
  if (!res.ok) throw new Error('No encontró horario');

  const seen = new Set<string>();
  for (const days of Object.values(res.schedule)) {
    for (const [day, slots] of Object.entries(days)) {
      for (const [slotStr, a] of Object.entries(slots)) {
        if (!a) continue;
        const key = `${a.teacher_id}|${a.compare_group}|${day}|${slotStr}`;
        if (seen.has(key)) throw new Error('Choque de docente detectado');
        seen.add(key);
      }
    }
  }
});

Deno.test('solveTimetable evita choques entre jornadas con mismo compare_group', () => {
  const model = {
    colegio_id: 'sigece',
    jornadas: [
      { id: 'PRI_AM', compare_group: 'AM' },
      { id: 'VIRTUAL', compare_group: 'AM' },
    ],
    slots: [
      { jornada_id: 'PRI_AM', day: 'Lun', slot: 1, is_break: false },
      { jornada_id: 'PRI_AM', day: 'Lun', slot: 2, is_break: false },
      { jornada_id: 'VIRTUAL', day: 'Lun', slot: 1, is_break: false },
      { jornada_id: 'VIRTUAL', day: 'Lun', slot: 2, is_break: false },
    ],
    sections: [
      { id: 'PRI-1A', jornada_id: 'PRI_AM', local_base: 'A' },
      { id: 'VIR-1A', jornada_id: 'VIRTUAL', local_base: 'VIRTUAL' },
    ],
    teachers: [{ id: 'D1' }],
    demands: [
      { section_id: 'PRI-1A', course_id: 'MAT', teacher_id: 'D1', hours_per_week: 1 },
      { section_id: 'VIR-1A', course_id: 'MAT', teacher_id: 'D1', hours_per_week: 1 },
    ],
    locals: [{ id: 'A' }, { id: 'VIRTUAL', is_virtual: true }],
    travel: {},
    events: [],
  };

  const res = solveTimetable(model as any, { attempts: 50, seed: 99 });
  if (!res.ok) throw new Error('No encontró horario');

  const seen = new Set<string>();
  for (const days of Object.values(res.schedule)) {
    for (const [day, slots] of Object.entries(days)) {
      for (const [slotStr, a] of Object.entries(slots)) {
        if (!a) continue;
        const key = `${a.teacher_id}|${a.compare_group}|${day}|${slotStr}`;
        if (seen.has(key)) throw new Error('Choque de docente entre jornadas detectado');
        seen.add(key);
      }
    }
  }
});

