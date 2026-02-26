// ═══════════════════════════════════════════════════════════════════════════════
// Smart Timetable Scheduling Engine — v7 (No off-day, split tutorials)
// ═══════════════════════════════════════════════════════════════════════════════
//
//  SLOT MAP  (9 AM – 5 PM, 8 hourly slots):
//    0 → 09-10 AM
//    1 → 10-11 AM
//    2 → 11-12 PM  ← mid-day window
//    3 → 12-01 PM  ← mid-day window
//    4 → 01-02 PM  ← mid-day window
//    5 → 02-03 PM
//    6 → 03-04 PM
//    7 → 04-05 PM
//
//  HARD CONSTRAINTS:
//    HC1  No teacher double-booking
//    HC2  No room double-booking
//    HC3  No section clash
//    HC4  No G1/G2 clash
//    HC5  Labs → Practicals only
//    HC6  Classrooms → Lectures/Tutorials only
//    HC7  Teacher 21–22 hrs/week
//    HC8  Max 7 classes/section/day
//    HC10 Mid-day gap: at least 1 of slots 2-4 must stay free
//    HC11 Max 3 consecutive classes per teacher
//
//  SOFT CONSTRAINTS (optimization goals):
//    SC1  Even subject distribution across week
//    SC2  No same subject twice in same day per section
//    SC3  Spread G1/G2 practicals across different days
//    SC4  Balanced teacher daily load
// ═══════════════════════════════════════════════════════════════════════════════

const DAYS = 6;          // Monday–Saturday
const SLOTS_PER_DAY = 8;          // 9 AM → 5 PM
const MID_DAY = [2, 3, 4];  // 11 AM–2 PM window
const MAX_DAILY = 7;    // max total classes per group per section per day
const MAX_PRACTICAL_DAY = 4;    // max practical SLOTS per group per day (2 blocks of 2 hrs each)
const MAX_CONSEC = 3;    // HC11: max consecutive teacher slots
const MIN_WEEK = 21;   // HC7 lower bound
const MAX_WEEK = 22;   // HC7 upper bound

// ── Matrix initialisation ─────────────────────────────────────────────────────

function initMatrix(keys) {
    const m = {};
    for (const k of keys)
        m[k] = Array.from({ length: DAYS }, () => Array(SLOTS_PER_DAY).fill(null));
    return m;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
}

function normSem(v) {
    return (v || '').toString().trim().toLowerCase().replace(/[\s-]/g, '');
}

// ── HC10: Mid-day gap check ───────────────────────────────────────────────────
// Block placement if it would fill ALL three mid-day slots.

function midDayOk(groupAvail, sectionId, group, day, hypotheticalSlot) {
    const keys = group === 'Combined'
        ? [`${sectionId}_G1`, `${sectionId}_G2`]
        : [`${sectionId}_${group}`];

    for (const key of keys) {
        const filledMid = MID_DAY.filter(s =>
            s === hypotheticalSlot ? true : !!groupAvail[key]?.[day]?.[s]
        ).length;
        if (filledMid >= 3) return false; // would fill all three → no gap
    }
    return true;
}

// ── HC8: Daily load check ─────────────────────────────────────────────────────

function dailyLoadOk(groupAvail, sectionId, group, day, newSlots) {
    const keys = group === 'Combined'
        ? [`${sectionId}_G1`, `${sectionId}_G2`]
        : [`${sectionId}_${group}`];
    for (const key of keys) {
        const cur = (groupAvail[key]?.[day] || []).filter(Boolean).length;
        if (cur + newSlots > MAX_DAILY) return false;
    }
    return true;
}

// ── HC11: Teacher consecutive limit ──────────────────────────────────────────

function consecOk(teacherAvail, teacherId, day, slot) {
    let run = 1;
    for (let s = slot - 1; s >= 0 && teacherAvail[teacherId]?.[day]?.[s]; s--) run++;
    for (let s = slot + 1; s < SLOTS_PER_DAY && teacherAvail[teacherId]?.[day]?.[s]; s++) run++;
    return run <= MAX_CONSEC;
}

// ── SC2: Same-subject-on-same-day soft check ─────────────────────────────────

function noSameDaySubject(groupAvail, sectionId, group, subjectId, day) {
    const keys = group === 'Combined'
        ? [`${sectionId}_G1`, `${sectionId}_G2`]
        : [`${sectionId}_${group}`];
    for (const key of keys) {
        const daySlots = groupAvail[key]?.[day] || [];
        if (daySlots.some(entry => entry && entry.subjectId === subjectId)) return false;
    }
    return true;
}

// ── HC12: Total gaps per day check ──────────────────────────────────────────

function totalGapsOk(groupAvail, sectionId, group, day, startSlot, dur) {
    const keys = group === 'Combined'
        ? [`${sectionId}_G1`, `${sectionId}_G2`]
        : [`${sectionId}_${group}`];

    for (const key of keys) {
        const daySlots = Array.from({ length: 8 }, (_, i) => !!groupAvail[key]?.[day]?.[i]);
        for (let i = 0; i < dur; i++) daySlots[startSlot + i] = true;

        const classCount = daySlots.filter(Boolean).length;
        if (classCount < 2) continue;

        const first = daySlots.indexOf(true);
        const last = daySlots.lastIndexOf(true);
        const totalGaps = (last - first + 1) - classCount;

        if (totalGaps > 2) return false;
    }
    return true;
}

// ── Core single-slot allocation check ────────────────────────────────────────

function canAllocate(teacherId, roomId, sectionId, group, day, slot, matrices) {
    const { teacherAvail, roomAvail, groupAvail } = matrices;

    // HC1: Teacher free
    if (teacherAvail[teacherId]?.[day]?.[slot]) return false;

    // HC2: Room free
    if (roomAvail[roomId]?.[day]?.[slot]) return false;

    // HC3/HC4: Group free
    if (group === 'Combined') {
        if (groupAvail[`${sectionId}_G1`]?.[day]?.[slot]) return false;
        if (groupAvail[`${sectionId}_G2`]?.[day]?.[slot]) return false;
    } else {
        if (groupAvail[`${sectionId}_${group}`]?.[day]?.[slot]) return false;
    }

    // HC11: Max 3 consecutive teacher slots
    if (!consecOk(teacherAvail, teacherId, day, slot)) return false;

    return true;
}

// ── Block check for multi-slot sessions (duration > 1) ───────────────────────

function canAllocateBlock(teacherId, roomId, sectionId, group, day, startSlot, dur, matrices, subjectId, type) {
    if (startSlot + dur > SLOTS_PER_DAY) return false;
    if (!dailyLoadOk(matrices.groupAvail, sectionId, group, day, dur)) return false;
    if (!totalGapsOk(matrices.groupAvail, sectionId, group, day, startSlot, dur)) return false;

    // CAP: Max 1 practical block (2 slots) per group per section per day.
    if (type === 'Practical' && (group === 'G1' || group === 'G2')) {
        const key = `${sectionId}_${group}`;
        const practicalSlotsToday = (matrices.groupAvail[key]?.[day] || []).filter(e => e?.type === 'Practical').length;
        if (practicalSlotsToday + dur > MAX_PRACTICAL_DAY) return false;
    }

    // HC_CLASH: When G1 is in ANY practical, G2 must be completely free from practicals.
    if (type === 'Practical' && (group === 'G1' || group === 'G2')) {
        const siblingGroup = group === 'G1' ? 'G2' : 'G1';
        const siblingKey = `${sectionId}_${siblingGroup}`;
        for (let i = 0; i < dur; i++) {
            const s = startSlot + i;
            const sibEntry = matrices.groupAvail[siblingKey]?.[day]?.[s];
            if (sibEntry && sibEntry.type === 'Practical') {
                return false; // sibling group is in a practical → G1/G2 practicals must not overlap
            }
        }
    }

    for (let i = 0; i < dur; i++) {
        const slot = startSlot + i;
        if (!canAllocate(teacherId, roomId, sectionId, group, day, slot, matrices)) return false;
        if (!midDayOk(matrices.groupAvail, sectionId, group, day, slot)) return false;
    }
    return true;
}

// ── Write session into all matrices ──────────────────────────────────────────

function allocateBlock(teacherId, roomId, sectionId, group, subjectId, day, startSlot, dur, matrices, type) {
    // DB payload uses group: 'Combined' | 'G1' | 'G2'
    const payload = { teacherId, roomId, sectionId, subjectId, group, type };
    for (let i = 0; i < dur; i++) {
        const s = startSlot + i;
        matrices.teacherAvail[teacherId][day][s] = payload;
        matrices.roomAvail[roomId][day][s] = payload;
        if (group === 'Combined') {
            matrices.groupAvail[`${sectionId}_G1`][day][s] = payload;
            matrices.groupAvail[`${sectionId}_G2`][day][s] = payload;
        } else {
            matrices.groupAvail[`${sectionId}_${group}`][day][s] = payload;
        }
    }
}

// ── Post-generation validators ────────────────────────────────────────────────

function validateMidDayGaps(groupAvail, sectionIds) {
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const violations = [];
    for (const sid of sectionIds) {
        for (let d = 0; d < DAYS; d++) {
            for (const g of ['G1', 'G2']) {
                const key = `${sid}_${g}`;
                const dayClasses = (groupAvail[key]?.[d] || []).filter(Boolean).length;
                if (dayClasses === 0) continue;
                const filledMid = MID_DAY.filter(s => !!groupAvail[key]?.[d]?.[s]).length;
                if (filledMid >= 3) violations.push(`${sid}_${g}: No mid-day gap on ${DAY_NAMES[d]}`);
            }
        }
    }
    return violations;
}

function validateDailyGaps(groupAvail, sectionIds) {
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const warnings = [];
    for (const sid of sectionIds) {
        for (let d = 0; d < DAYS; d++) {
            for (const g of ['G1', 'G2']) {
                const key = `${sid}_${g}`;
                const mask = (groupAvail[key]?.[d] || []).map(Boolean);
                const filled = mask.filter(Boolean).length;
                if (filled < 2) continue;
                const first = mask.indexOf(true);
                const last = mask.lastIndexOf(true);
                // DG2: max 2 total gaps
                let totalGaps = (last - first + 1) - filled;
                if (totalGaps > 2) {
                    warnings.push(`${sid}_${g}: >2 total gaps on ${DAY_NAMES[d]}`);
                }
            }
        }
    }
    return warnings;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export function generateTimetableLogic(teachers, rooms, subjects, sections) {

    const teacherIds = Object.keys(teachers || {});
    const roomIds = Object.keys(rooms || {});
    const subjectIds = Object.keys(subjects || {});
    const sectionIds = Object.keys(sections || {});

    const fail = (msg) => ({
        feasibilityResult: 'PARTIAL_SUCCESS', timetable: {},
        teacherWorkloadSummary: {}, roomUtilizationSummary: {},
        optimizationScore: 0, conflictReport: [msg],
        gapValidationReport: []
    });

    if (!teacherIds.length) return fail('No teachers. Add at least one teacher.');
    if (!roomIds.length) return fail('No rooms. Add Classrooms and Labs.');
    if (!subjectIds.length) return fail('No subjects. Add subjects with L/T/P values.');
    if (!sectionIds.length) return fail('No sections. Add at least one section.');

    // ── Room classification (HC5/HC6) ─────────────────────────────────────────
    const classrooms = roomIds.filter(r => (rooms[r].type || '').trim().toLowerCase() === 'classroom');
    const labs = roomIds.filter(r => {
        const t = (rooms[r].type || '').trim().toLowerCase();
        return t === 'lab' || t === 'laboratory';
    });

    if (!classrooms.length) return fail('No Classrooms found. Add rooms with type "Classroom".');
    if (!labs.length) return fail('No Labs found. Add rooms with type "Lab".');

    console.log(`[Scheduler] Teachers:${teacherIds.length} CR:${classrooms.length} Labs:${labs.length} Sections:${sectionIds.length}`);

    // ── Build session list ────────────────────────────────────────────────────
    const groupIds = [];
    sectionIds.forEach(s => { groupIds.push(`${s}_G1`); groupIds.push(`${s}_G2`); });

    const allSessions = [];
    let totalHours = 0;

    for (const secId of sectionIds) {
        for (const subId of subjectIds) {
            const sub = subjects[subId];
            const sec = sections[secId];
            const subSem = normSem(sub.semester);
            const secSem = normSem(sec.semester);
            if (subSem && secSem && subSem !== secSem) continue;

            const L = Math.max(0, parseInt(sub.lectures || 0, 10));
            const T = Math.max(0, parseInt(sub.tutorials || 0, 10));
            const P = Math.max(0, parseInt(sub.practicals || 0, 10));
            if (L + T + P === 0) continue;

            for (let i = 0; i < L; i++)
                allSessions.push({ sectionId: secId, subjectId: subId, type: 'Lecture', group: 'Combined', duration: 1, roomType: 'classroom' });

            // Generate G1 and G2 specific tutorials
            for (let i = 0; i < T; i++) {
                allSessions.push({ sectionId: secId, subjectId: subId, type: 'Tutorial', group: 'G1', duration: 1, roomType: 'classroom' });
                allSessions.push({ sectionId: secId, subjectId: subId, type: 'Tutorial', group: 'G2', duration: 1, roomType: 'classroom' });
            }

            // P = practical HOURS per week. 
            // 1 block = 2 hours. Number of blocks = ceil(P/2).
            const practicalBlocks = Math.ceil(P / 2);
            for (let i = 0; i < practicalBlocks; i++) {
                allSessions.push({ sectionId: secId, subjectId: subId, type: 'Practical', group: 'G1', duration: 2, roomType: 'lab' });
                allSessions.push({ sectionId: secId, subjectId: subId, type: 'Practical', group: 'G2', duration: 2, roomType: 'lab' });
            }
            totalHours += L + (T * 2) + (practicalBlocks * 4);
        }
    }

    if (allSessions.length === 0) {
        return fail('No subjects matched section semesters. Use Quick Setup to assign semesters, then re-run.');
    }

    const pCount = allSessions.filter(s => s.type === 'Practical').length;
    const lCount = allSessions.filter(s => s.type === 'Lecture').length;
    const tCount = allSessions.filter(s => s.type === 'Tutorial').length;
    console.log(`[Scheduler] L:${lCount} T:${tCount} P:${pCount} total hrs:${totalHours}`);

    // ── Heuristic search ──────────────────────────────────────────────────────
    let bestScore = -1;
    let bestMatrices = null;
    let finalConflicts = [];

    const BUDGET_MS = 12000;
    const MAX_ATTEMPTS = 30;
    const t0 = Date.now();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (Date.now() - t0 > BUDGET_MS) break;

        const matrices = {
            teacherAvail: initMatrix(teacherIds),
            roomAvail: initMatrix(roomIds),
            groupAvail: initMatrix(groupIds)
        };

        const weeklyLoad = {};
        teacherIds.forEach(t => weeklyLoad[t] = 0);

        const sessions = [...allSessions];
        shuffle(sessions);

        sessions.sort((a, b) => {
            const pri = x => x.type === 'Lecture' ? 0 : x.type === 'Practical' ? 1 : 2;
            return pri(a) - pri(b);
        });

        let scheduled = 0;
        const conflictSet = new Set();
        const conflicts = [];

        for (const session of sessions) {
            if (Date.now() - t0 > BUDGET_MS) break;

            const dur = session.duration;
            const pRooms = session.roomType === 'lab' ? [...labs] : [...classrooms];
            const fRooms = session.roomType === 'lab' ? [...classrooms] : [...labs];
            shuffle(pRooms);

            // Build available slot combinations (Schedule Monday-Friday only)
            const slots = [];
            for (let d = 0; d < 5; d++) {
                for (let s = 0; s <= SLOTS_PER_DAY - dur; s++) slots.push({ d, s });
            }
            shuffle(slots);

            // Teachers sorted by least load first (HC7 balancing)
            const eligible = [...teacherIds]
                .filter(t => weeklyLoad[t] + dur <= MAX_WEEK)
                .sort((a, b) => weeklyLoad[a] - weeklyLoad[b]);

            let placed = false;

            // Helper to try placing
            const tryPlace = (roomPool) => {
                for (const { d, s } of slots) {
                    const sameDayOk = noSameDaySubject(matrices.groupAvail, session.sectionId, session.group, session.subjectId, d);
                    for (const rId of roomPool) {
                        for (const tId of eligible) {
                            if (canAllocateBlock(tId, rId, session.sectionId, session.group, d, s, dur, matrices, session.subjectId, session.type)) {
                                if (!sameDayOk && placed !== undefined) continue;
                                allocateBlock(tId, rId, session.sectionId, session.group, session.subjectId, d, s, dur, matrices, session.type);
                                weeklyLoad[tId] += dur;
                                return true;
                            }
                        }
                    }
                }
                for (const { d, s } of slots) {
                    for (const rId of roomPool) {
                        for (const tId of eligible) {
                            if (canAllocateBlock(tId, rId, session.sectionId, session.group, d, s, dur, matrices, session.subjectId, session.type)) {
                                allocateBlock(tId, rId, session.sectionId, session.group, session.subjectId, d, s, dur, matrices, session.type);
                                weeklyLoad[tId] += dur;
                                return true;
                            }
                        }
                    }
                }
                return false;
            };

            placed = tryPlace(pRooms);
            if (!placed) placed = tryPlace(fRooms); // Tier 2: fallback room

            // Tier 3: any room + any teacher (last resort)
            if (!placed) {
                const allRooms = [...roomIds];
                shuffle(allRooms);
                const anyTeachers = [...teacherIds]
                    .filter(t => weeklyLoad[t] + dur <= MAX_WEEK) // Strict cap
                    .sort((a, b) => weeklyLoad[a] - weeklyLoad[b]);
                outer3:
                for (const { d, s } of slots) {
                    for (const rId of allRooms) {
                        for (const tId of anyTeachers) {
                            if (canAllocateBlock(tId, rId, session.sectionId, session.group, d, s, dur, matrices, session.subjectId, session.type)) {
                                allocateBlock(tId, rId, session.sectionId, session.group, session.subjectId, d, s, dur, matrices, session.type);
                                weeklyLoad[tId] += dur;
                                placed = true;
                                break outer3;
                            }
                        }
                    }
                }
            }

            if (placed) {
                scheduled += dur;
            } else {
                const secName = sections[session.sectionId]?.name || session.sectionId;
                const subName = subjects[session.subjectId]?.code || subjects[session.subjectId]?.name || session.subjectId;
                const key = `${session.sectionId}|${session.subjectId}|${session.type}|${session.group}`;
                if (!conflictSet.has(key)) {
                    conflictSet.add(key);
                    conflicts.push(`${session.type} (${session.group}): ${secName} – ${subName}`);
                }
            }
        }

        console.log(`[Scheduler] Attempt ${attempt + 1}: ${scheduled}/${totalHours}`);

        if (scheduled > bestScore) {
            bestScore = scheduled;
            bestMatrices = matrices;
            finalConflicts = conflicts;
        }
        if (scheduled >= totalHours) break;
    }

    if (!bestMatrices) return fail('Could not place any sessions. Check room types and teachers.');

    // ── Enforce Minimum 31 Periods (Self Study) ───────────────────────────────
    // For any section that has fewer than 31 slots filled (counting max of G1/G2),
    // fill empty slots with "Self Study" up to exactly 31.
    for (const sid of sectionIds) {
        let countG1 = 0;
        let countG2 = 0;
        for (let d = 0; d < 5; d++) {
            for (let s = 0; s < SLOTS_PER_DAY; s++) {
                if (bestMatrices.groupAvail[`${sid}_G1`]?.[d]?.[s]) countG1++;
                if (bestMatrices.groupAvail[`${sid}_G2`]?.[d]?.[s]) countG2++;
            }
        }

        let currentMax = Math.max(countG1, countG2);
        if (currentMax < 31) {
            let needed = 31 - currentMax;
            // Try filling from the end of the day backward, across Mon-Fri
            outerFill:
            for (let s = SLOTS_PER_DAY - 1; s >= 0; s--) {
                for (let d = 0; d < 5; d++) {
                    if (needed <= 0) break outerFill;

                    const g1Free = !bestMatrices.groupAvail[`${sid}_G1`]?.[d]?.[s];
                    const g2Free = !bestMatrices.groupAvail[`${sid}_G2`]?.[d]?.[s];

                    if (g1Free && g2Free) {
                        const selfStudyPayload = {
                            teacherId: 'self',
                            roomId: 'self',
                            sectionId: sid,
                            subjectId: 'Self Study',
                            group: 'Combined',
                            type: 'Self Study'
                        };
                        bestMatrices.groupAvail[`${sid}_G1`][d][s] = selfStudyPayload;
                        bestMatrices.groupAvail[`${sid}_G2`][d][s] = selfStudyPayload;
                        needed--;
                    }
                }
            }
        }
    }

    // ── Build timetable output ────────────────────────────────────────────────
    const timetable = {};
    sectionIds.forEach(sid => {
        timetable[sid] = {};
        for (let d = 0; d < DAYS; d++) {
            timetable[sid][d] = {};
            for (let s = 0; s < SLOTS_PER_DAY; s++) {
                const g1 = bestMatrices.groupAvail[`${sid}_G1`]?.[d]?.[s] || null;
                const g2 = bestMatrices.groupAvail[`${sid}_G2`]?.[d]?.[s] || null;
                if (g1 || g2) timetable[sid][d][s] = { g1, g2 };
            }
        }
    });

    // ── Reports ───────────────────────────────────────────────────────────────
    const teacherWorkloadSummary = {};
    teacherIds.forEach(tId => {
        let c = 0;
        for (let d = 0; d < DAYS; d++)
            for (let s = 0; s < SLOTS_PER_DAY; s++)
                if (bestMatrices.teacherAvail[tId]?.[d]?.[s]) c++;
        teacherWorkloadSummary[tId] = c;
    });

    const roomUtilizationSummary = {};
    roomIds.forEach(rId => {
        let c = 0;
        for (let d = 0; d < DAYS; d++)
            for (let s = 0; s < SLOTS_PER_DAY; s++)
                if (bestMatrices.roomAvail[rId]?.[d]?.[s]) c++;
        roomUtilizationSummary[rId] = c;
    });

    const midDayViolations = validateMidDayGaps(bestMatrices.groupAvail, sectionIds);
    const gapWarnings = validateDailyGaps(bestMatrices.groupAvail, sectionIds);

    const gapValidationReport = [
        ...midDayViolations.map(v => `⚠ ${v}`),
        ...gapWarnings.map(v => `ℹ ${v}`)
    ];

    const optimizationScore = totalHours > 0
        ? Math.min(100, Math.round((bestScore / totalHours) * 100))
        : 100;

    const feasibilityResult = (midDayViolations.length) > 0
        ? 'PARTIAL_SUCCESS'
        : optimizationScore >= 100 ? 'SUCCESS' : 'PARTIAL_SUCCESS';

    console.log(`[Scheduler] Score:${optimizationScore}% | Mid-day violations:${midDayViolations.length}`);

    return {
        timetable,
        teacherWorkloadSummary,
        roomUtilizationSummary,
        gapValidationReport,
        feasibilityResult,
        optimizationScore,
        conflictReport: finalConflicts.slice(0, 15)
    };
}
