export type DayKey = string;

export type SlotKey = {
  jornada_id: string;
  day: DayKey;
  slot: number;
};

export type Section = {
  id: string;
  nivel?: string;
  grado?: string;
  seccion?: string;
  turno?: string;
  local_base?: string;
  jornada_id?: string;
};

export type Teacher = {
  id: string;
  nombre?: string;
  local_base?: string;
  locales_permitidos?: string[];
  availability?: Record<DayKey, number[]>;
  max_horas_semana?: number;
  preferencias?: {
    prefer_local_day?: boolean;
  };
};

export type Demand = {
  section_id: string;
  course_id: string;
  teacher_id: string;
  hours_per_week: number;
  required_local_id?: string;
  required_room_type?: string;
};

export type Local = {
  id: string;
  nombre?: string;
  is_virtual?: boolean;
};

export type Jornada = {
  id: string;
  nombre?: string;
  tipo?: string;
  nivel?: string;
  compare_group?: string;
};

export type SlotDef = {
  jornada_id: string;
  day: DayKey;
  slot: number;
  is_break?: boolean;
};

export type InputModel = {
  colegio_id: string;
  jornadas?: Jornada[];
  slots?: SlotDef[];
  days?: DayKey[];
  slots_per_day?: number;
  break_slots?: number[];
  travel_minutes_between_locals?: number;
  max_consecutive_same_course?: number;
  sections: Section[];
  teachers: Teacher[];
  demands: Demand[];
  locals?: Local[];
  travel?: Record<string, number>;
  events?: Array<{ scope: 'global' | 'section' | 'teacher'; target_id?: string; jornada_id?: string; day: DayKey; slot: number }>;
};

export type Assignment = {
  course_id: string;
  teacher_id: string;
  section_id: string;
  local_id: string;
  jornada_id: string;
  compare_group: string;
};

export type SolveResult = {
  ok: boolean;
  schedule: Record<string, Record<DayKey, Record<number, Assignment | null>>>;
  teacher_view: Record<string, Array<{ day: DayKey; slot: number; section_id: string; course_id: string; local_id: string; jornada_id: string; compare_group: string }>>;
  unassigned: Array<{ section_id: string; course_id: string; teacher_id: string; reason: string }>;
  metrics: {
    teacher_gaps: Record<string, number>;
    teacher_local_changes: Record<string, number>;
    max_course_streak: Record<string, number>;
    attempts: number;
  };
};

function keyLocalTravel(travel: Record<string, number> | undefined, fromLocal: string, toLocal: string): number {
  if (!travel) return 0;
  const k1 = `${fromLocal}->${toLocal}`;
  const k2 = `${toLocal}->${fromLocal}`;
  return Number.isFinite(travel[k1]) ? travel[k1] : (Number.isFinite(travel[k2]) ? travel[k2] : 0);
}

function normalizeJornadaId(jornadaId: unknown): string {
  const s = String(jornadaId || '').trim();
  return s || 'DEFAULT';
}

function normalizeModel(model: InputModel): Required<Pick<InputModel, 'jornadas' | 'slots'>> & Omit<InputModel, 'jornadas' | 'slots'> {
  const jornadasIn = Array.isArray(model.jornadas) ? model.jornadas : [];
  const jornadas = jornadasIn.length ? jornadasIn.map(j => ({ ...j, id: normalizeJornadaId(j.id), compare_group: String(j.compare_group || '').trim() || normalizeJornadaId(j.id) })) : [
    { id: 'DEFAULT', compare_group: 'DEFAULT' },
  ];

  let slots: SlotDef[] = Array.isArray(model.slots) ? model.slots : [];
  if (!slots.length) {
    const days = Array.isArray(model.days) && model.days.length ? model.days : ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'];
    const n = Math.max(1, Math.floor(Number(model.slots_per_day || 0) || 0));
    const breaks = new Set((model.break_slots || []).map(Number));
    const jornada_id = 'DEFAULT';
    for (const day of days) {
      for (let s = 1; s <= n; s++) slots.push({ jornada_id, day, slot: s, is_break: breaks.has(s) });
    }
  } else {
    slots = slots.map(s => ({ jornada_id: normalizeJornadaId(s.jornada_id), day: String(s.day || '').trim(), slot: Math.floor(Number(s.slot || 0) || 0), is_break: !!s.is_break }))
      .filter(s => s.jornada_id && s.day && s.slot > 0);
  }

  const sections = (model.sections || []).map(s => ({ ...s, jornada_id: normalizeJornadaId(s.jornada_id) }));

  return { ...model, jornadas, slots, sections };
}

function buildSlotsIndex(model: ReturnType<typeof normalizeModel>) {
  const byJornadaDay = new Map<string, Map<DayKey, { all: Set<number>; breaks: Set<number>; avail: Set<number> }>>();
  const daysSet = new Set<DayKey>();
  for (const sd of model.slots) {
    daysSet.add(sd.day);
    if (!byJornadaDay.has(sd.jornada_id)) byJornadaDay.set(sd.jornada_id, new Map());
    const perDay = byJornadaDay.get(sd.jornada_id)!;
    if (!perDay.has(sd.day)) perDay.set(sd.day, { all: new Set(), breaks: new Set(), avail: new Set() });
    const entry = perDay.get(sd.day)!;
    entry.all.add(sd.slot);
    if (sd.is_break) entry.breaks.add(sd.slot);
    else entry.avail.add(sd.slot);
  }
  return { byJornadaDay, days: Array.from(daysSet) };
}

function buildEmptySchedule(model: ReturnType<typeof normalizeModel>, slotsIdx: ReturnType<typeof buildSlotsIndex>) {
  const schedule: Record<string, Record<DayKey, Record<number, Assignment | null>>> = {};
  for (const sec of model.sections) {
    const secDays: Record<DayKey, Record<number, Assignment | null>> = {};
    const jornadaId = normalizeJornadaId(sec.jornada_id);
    const perDay = slotsIdx.byJornadaDay.get(jornadaId);
    const days = perDay ? Array.from(perDay.keys()) : (Array.isArray(model.days) ? model.days : []);
    for (const day of days) {
      const slots: Record<number, Assignment | null> = {};
      const slotSet = perDay?.get(day)?.all || new Set<number>();
      for (const s of Array.from(slotSet).sort((a, b) => a - b)) slots[s] = null;
      secDays[day] = slots;
    }
    schedule[sec.id] = secDays;
  }
  return schedule;
}

function buildTeacherAvailability(model: ReturnType<typeof normalizeModel>): Record<string, Record<DayKey, Set<number>> | null> {
  const out: Record<string, Record<DayKey, Set<number>> | null> = {};
  for (const t of model.teachers) {
    if (t.availability && typeof t.availability === 'object') {
      const perDay: Record<DayKey, Set<number>> = {};
      for (const [day, list] of Object.entries(t.availability)) {
        if (!Array.isArray(list)) continue;
        perDay[day] = new Set(list.map(Number).filter(n => Number.isFinite(n) && n > 0).map(n => Math.floor(n)));
      }
      out[t.id] = perDay;
    } else {
      out[t.id] = null;
    }
  }
  return out;
}

function eventBlocked(model: ReturnType<typeof normalizeModel>, jornadaId: string, day: DayKey, slot: number, sectionId: string, teacherId: string): boolean {
  if (!Array.isArray(model.events) || model.events.length === 0) return false;
  for (const e of model.events) {
    if (e.day !== day || e.slot !== slot) continue;
    if (e.jornada_id && normalizeJornadaId(e.jornada_id) !== jornadaId) continue;
    if (e.scope === 'global') return true;
    if (e.scope === 'section' && e.target_id === sectionId) return true;
    if (e.scope === 'teacher' && e.target_id === teacherId) return true;
  }
  return false;
}

type Task = { section_id: string; course_id: string; teacher_id: string; local_id: string; jornada_id: string; compare_group: string };

function buildTasks(model: ReturnType<typeof normalizeModel>, compareGroupByJornada: (jid: string) => string): Task[] {
  const sectionsById = new Map(model.sections.map(s => [s.id, s]));
  const tasks: Task[] = [];
  for (const d of model.demands) {
    const sec = sectionsById.get(d.section_id);
    const jornada_id = normalizeJornadaId(sec?.jornada_id);
    const compare_group = compareGroupByJornada(jornada_id);
    const local = (d.required_local_id || sec?.local_base || '').trim();
    const local_id = local || (model.locals?.[0]?.id || '');
    const n = Math.max(0, Math.floor(d.hours_per_week || 0));
    for (let i = 0; i < n; i++) tasks.push({ section_id: d.section_id, course_id: d.course_id, teacher_id: d.teacher_id, local_id, jornada_id, compare_group });
  }
  return tasks;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  let x = seed || 1;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    const j = Math.abs(x) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeTeacherGaps(teacherView: Record<string, Array<{ day: DayKey; slot: number }>>): Record<string, number> {
  const gaps: Record<string, number> = {};
  for (const [tid, items] of Object.entries(teacherView)) {
    const byDay: Record<string, number[]> = {};
    for (const it of items) {
      byDay[it.day] ||= [];
      byDay[it.day].push(it.slot);
    }
    let g = 0;
    for (const slots of Object.values(byDay)) {
      slots.sort((a, b) => a - b);
      for (let i = 1; i < slots.length; i++) {
        const diff = slots[i] - slots[i - 1];
        if (diff > 1) g += diff - 1;
      }
    }
    gaps[tid] = g;
  }
  return gaps;
}

function computeTeacherLocalChanges(teacherView: Record<string, Array<{ day: DayKey; slot: number; local_id: string }>>): Record<string, number> {
  const changes: Record<string, number> = {};
  for (const [tid, items] of Object.entries(teacherView)) {
    const byDay: Record<string, Array<{ slot: number; local_id: string }>> = {};
    for (const it of items) {
      byDay[it.day] ||= [];
      byDay[it.day].push({ slot: it.slot, local_id: it.local_id || '' });
    }
    let c = 0;
    for (const list of Object.values(byDay)) {
      list.sort((a, b) => a.slot - b.slot);
      for (let i = 1; i < list.length; i++) {
        if ((list[i - 1].local_id || '') && (list[i].local_id || '') && list[i - 1].local_id !== list[i].local_id) c++;
      }
    }
    changes[tid] = c;
  }
  return changes;
}

function maxCourseStreak(schedule: Record<string, Record<DayKey, Record<number, Assignment | null>>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [secId, days] of Object.entries(schedule)) {
    let max = 0;
    for (const slots of Object.values(days)) {
      let prev: string | null = null;
      let streak = 0;
      const indices = Object.keys(slots).map(Number).sort((a, b) => a - b);
      for (const s of indices) {
        const a = slots[s];
        const c = a?.course_id || null;
        if (!c) { prev = null; streak = 0; continue; }
        if (c === prev) streak++;
        else { prev = c; streak = 1; }
        if (streak > max) max = streak;
      }
    }
    out[secId] = max;
  }
  return out;
}

export function solveTimetable(model: InputModel, opts?: { attempts?: number; seed?: number }): SolveResult {
  const nm = normalizeModel(model);
  const attempts = Math.max(1, Math.floor(opts?.attempts || 25));
  const baseSeed = Math.floor(opts?.seed || Date.now());
  const maxConsec = Math.max(1, Math.floor(nm.max_consecutive_same_course || 2));
  const travelDefault = Math.max(0, Math.floor(nm.travel_minutes_between_locals || 0));
  const teachersById = new Map(nm.teachers.map(t => [t.id, t]));
  const teacherAvail = buildTeacherAvailability(nm);

  const jornadasById = new Map(nm.jornadas.map(j => [normalizeJornadaId(j.id), { ...j, id: normalizeJornadaId(j.id), compare_group: String(j.compare_group || '').trim() || normalizeJornadaId(j.id) }]));
  const compareGroupByJornada = (jid: string) => (jornadasById.get(normalizeJornadaId(jid))?.compare_group || normalizeJornadaId(jid));

  const localsVirtual = new Set((nm.locals || []).filter(l => !!l.is_virtual).map(l => String(l.id || '').trim()).filter(Boolean));
  const slotsIdx = buildSlotsIndex(nm);
  const slotsListByJornada: Record<string, SlotKey[]> = {};
  for (const [jid, perDay] of slotsIdx.byJornadaDay.entries()) {
    const list: SlotKey[] = [];
    for (const [day, entry] of perDay.entries()) {
      for (const s of Array.from(entry.avail).sort((a, b) => a - b)) list.push({ jornada_id: jid, day, slot: s });
    }
    slotsListByJornada[jid] = list;
  }

  const baseTasks = buildTasks(nm, compareGroupByJornada);

  let best: SolveResult | null = null;

  for (let att = 0; att < attempts; att++) {
    const schedule = buildEmptySchedule(nm, slotsIdx);
    const teacherBusy: Record<string, Record<string, Record<DayKey, Record<number, Assignment | null>>>> = {};
    for (const t of nm.teachers) teacherBusy[t.id] = {};

    const teacherHours: Record<string, number> = {};
    for (const t of nm.teachers) teacherHours[t.id] = 0;

    const tasks = shuffle(baseTasks, baseSeed + att * 9973);
    const unassigned: Array<{ section_id: string; course_id: string; teacher_id: string; reason: string }> = [];

    function violatesCourseStreak(section_id: string, day: DayKey, slot: number, course_id: string): boolean {
      let countLeft = 0;
      for (let s = slot - 1; s >= 1; s--) {
        const a = schedule[section_id]?.[day]?.[s];
        if (!a || a.course_id !== course_id) break;
        countLeft++;
      }
      let countRight = 0;
      for (let s = slot + 1; s <= slot + maxConsec + 3; s++) {
        const a = schedule[section_id]?.[day]?.[s];
        if (!a || a.course_id !== course_id) break;
        countRight++;
      }
      return (countLeft + 1 + countRight) > maxConsec;
    }

    function getTeacherBusy(teacher_id: string, compare_group: string, day: DayKey, slot: number): Assignment | null {
      const tg = teacherBusy[teacher_id]?.[compare_group]?.[day];
      return tg ? (tg[slot] || null) : null;
    }

    function setTeacherBusy(teacher_id: string, compare_group: string, day: DayKey, slot: number, asg: Assignment) {
      teacherBusy[teacher_id] ||= {};
      teacherBusy[teacher_id][compare_group] ||= {};
      teacherBusy[teacher_id][compare_group][day] ||= {};
      teacherBusy[teacher_id][compare_group][day][slot] = asg;
    }

    function violatesTravel(teacher_id: string, compare_group: string, day: DayKey, slot: number, local_id: string): boolean {
      if (!local_id) return false;
      if (localsVirtual.has(local_id)) return false;
      const t = teachersById.get(teacher_id);
      const prev = getTeacherBusy(teacher_id, compare_group, day, slot - 1);
      const next = getTeacherBusy(teacher_id, compare_group, day, slot + 1);
      const prevLocal = prev?.local_id || '';
      const nextLocal = next?.local_id || '';
      if (prevLocal && localsVirtual.has(prevLocal)) return false;
      if (nextLocal && localsVirtual.has(nextLocal)) return false;

      const allowSameDaySingleLocal = !!t?.preferencias?.prefer_local_day;
      if (allowSameDaySingleLocal) {
        const dayItems: string[] = [];
        const perDay = teacherBusy[teacher_id]?.[compare_group]?.[day] || {};
        for (const a of Object.values(perDay)) if (a?.local_id && !localsVirtual.has(a.local_id)) dayItems.push(a.local_id);
        const localsUsed = new Set(dayItems);
        if (localsUsed.size >= 1 && !localsUsed.has(local_id)) return true;
      }

      const travelPrev = prevLocal && local_id && prevLocal !== local_id ? Math.max(travelDefault, keyLocalTravel(model.travel, prevLocal, local_id)) : 0;
      if (travelPrev > 0 && prev) return true;
      const travelNext = nextLocal && local_id && nextLocal !== local_id ? Math.max(travelDefault, keyLocalTravel(model.travel, local_id, nextLocal)) : 0;
      if (travelNext > 0 && next) return true;
      return false;
    }

    function scoreSlot(task: Task, sk: SlotKey): number {
      let score = 0;
      const tb = teacherBusy[task.teacher_id]?.[task.compare_group]?.[sk.day] || {};
      if (tb[sk.slot - 1]) score += 2;
      if (tb[sk.slot + 1]) score += 2;
      const sec = schedule[task.section_id]?.[sk.day] || {};
      if (sec[sk.slot - 1]) score += 1;
      if (sec[sk.slot + 1]) score += 1;
      const t = teachersById.get(task.teacher_id);
      if (t?.local_base && task.local_id && t.local_base === task.local_id) score += 1;
      return score;
    }

    for (const task of tasks) {
      const t = teachersById.get(task.teacher_id);
      if (!t) { unassigned.push({ ...task, reason: 'Docente no existe' }); continue; }

      const maxSem = Math.max(0, Math.floor(t.max_horas_semana || 0));
      if (maxSem && (teacherHours[task.teacher_id] || 0) >= maxSem) { unassigned.push({ ...task, reason: 'Docente excede máximo semanal' }); continue; }

      let placed = false;

      const candidates: SlotKey[] = [];
      const slotsList = slotsListByJornada[task.jornada_id] || [];
      for (const sk of slotsList) {
        if (eventBlocked(nm, sk.jornada_id, sk.day, sk.slot, task.section_id, task.teacher_id)) continue;
        const availPerDay = teacherAvail[task.teacher_id];
        if (availPerDay && availPerDay[sk.day] && !availPerDay[sk.day].has(sk.slot)) continue;
        if (getTeacherBusy(task.teacher_id, task.compare_group, sk.day, sk.slot)) continue;
        if (schedule[task.section_id]?.[sk.day]?.[sk.slot]) continue;
        if (violatesCourseStreak(task.section_id, sk.day, sk.slot, task.course_id)) continue;
        if (violatesTravel(task.teacher_id, task.compare_group, sk.day, sk.slot, task.local_id)) continue;
        candidates.push(sk);
      }

      candidates.sort((a, b) => scoreSlot(task, b) - scoreSlot(task, a));

      const top = candidates.slice(0, Math.min(8, candidates.length));
      const chosen = top.length ? top[Math.abs((baseSeed + att + task.course_id.length) * 31) % top.length] : null;
      if (chosen) {
        const asg: Assignment = { section_id: task.section_id, course_id: task.course_id, teacher_id: task.teacher_id, local_id: task.local_id, jornada_id: task.jornada_id, compare_group: task.compare_group };
        schedule[task.section_id][chosen.day][chosen.slot] = asg;
        setTeacherBusy(task.teacher_id, task.compare_group, chosen.day, chosen.slot, asg);
        teacherHours[task.teacher_id] = (teacherHours[task.teacher_id] || 0) + 1;
        placed = true;
      }

      if (!placed) unassigned.push({ ...task, reason: 'Sin slot factible' });
    }

    const teacher_view: SolveResult['teacher_view'] = {};
    for (const t of nm.teachers) teacher_view[t.id] = [];
    for (const [secId, days] of Object.entries(schedule)) {
      for (const [day, slots] of Object.entries(days)) {
        for (const [slotStr, asg] of Object.entries(slots)) {
          const slot = Number(slotStr);
          if (!asg) continue;
          teacher_view[asg.teacher_id] ||= [];
          teacher_view[asg.teacher_id].push({ day, slot, section_id: secId, course_id: asg.course_id, local_id: asg.local_id, jornada_id: asg.jornada_id, compare_group: asg.compare_group });
        }
      }
    }

    const gaps = computeTeacherGaps(Object.fromEntries(Object.entries(teacher_view).map(([k, v]) => [k, v.map(x => ({ day: x.day, slot: x.slot }))])));
    const changes = computeTeacherLocalChanges(teacher_view);
    const streaks = maxCourseStreak(schedule);

    const ok = unassigned.length === 0;
    const result: SolveResult = {
      ok,
      schedule,
      teacher_view,
      unassigned,
      metrics: {
        teacher_gaps: gaps,
        teacher_local_changes: changes,
        max_course_streak: streaks,
        attempts: att + 1,
      },
    };

    if (ok) return result;

    if (!best || result.unassigned.length < best.unassigned.length) best = result;
  }

  return best || {
    ok: false,
    schedule: buildEmptySchedule(nm, slotsIdx),
    teacher_view: {},
    unassigned: baseTasks.slice(0, 200).map(t => ({ ...t, reason: 'No asignado' })),
    metrics: { teacher_gaps: {}, teacher_local_changes: {}, max_course_streak: {}, attempts },
  };
}

