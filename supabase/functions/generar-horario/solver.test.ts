import { solveTimetable } from './solver.ts';

Deno.test('solveTimetable genera sin choques de docente en caso simple', () => {
  const model = {
    colegio_id: 'sigece',
    days: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'],
    slots_per_day: 4,
    break_slots: [3],
    travel_minutes_between_locals: 0,
    max_consecutive_same_course: 2,
    sections: [
      { id: 'PRI-1A', local_base: 'A' },
      { id: 'PRI-1B', local_base: 'A' },
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
        const key = `${a.teacher_id}|${day}|${slotStr}`;
        if (seen.has(key)) throw new Error('Choque de docente detectado');
        seen.add(key);
      }
    }
  }
});

