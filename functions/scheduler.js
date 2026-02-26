const DAYS = 6
const SLOTS_PER_DAY = 8

function initAvailability(keys) {
    const matrix = {}
    for (const key of keys) {
        matrix[key] = Array.from({ length: DAYS }, () => Array(SLOTS_PER_DAY).fill(null))
    }
    return matrix
}

function canAllocate(teacherId, roomId, sectionId, groupId, day, slot, matrices) {
    const { teacherAvail, roomAvail, groupAvail } = matrices

    if (teacherAvail[teacherId]?.[day]?.[slot]) return false
    if (roomAvail[roomId]?.[day]?.[slot]) return false

    if (groupId === 'ALL') {
        if (groupAvail[`${sectionId}_G1`]?.[day]?.[slot] || groupAvail[`${sectionId}_G2`]?.[day]?.[slot]) return false
    } else {
        if (groupAvail[`${sectionId}_${groupId}`]?.[day]?.[slot]) return false
    }

    let continuousCount = 1
    for (let s = slot - 1; s >= 0 && teacherAvail[teacherId]?.[day]?.[s]; s--) continuousCount++
    for (let s = slot + 1; s < SLOTS_PER_DAY && teacherAvail[teacherId]?.[day]?.[s]; s++) continuousCount++
    if (continuousCount > 3) return false

    let g1Count = 0
    let g2Count = 0
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
        if (groupAvail[`${sectionId}_G1`]?.[day]?.[i]) g1Count++
        if (groupAvail[`${sectionId}_G2`]?.[day]?.[i]) g2Count++
    }
    if (groupId === 'ALL' && (g1Count >= 5 || g2Count >= 5)) return false
    if (groupId === 'G1' && g1Count >= 5) return false
    if (groupId === 'G2' && g2Count >= 5) return false

    if (groupId === 'ALL') {
        if (!passesGapRules(sectionId, 'G1', day, slot, groupAvail)) return false
        if (!passesGapRules(sectionId, 'G2', day, slot, groupAvail)) return false
    } else {
        if (!passesGapRules(sectionId, groupId, day, slot, groupAvail)) return false
    }

    return true
}

function allocate(teacherId, roomId, sectionId, groupId, subjectId, day, slot, matrices, type) {
    const payload = { teacherId, roomId, sectionId, subjectId, groupId, type }
    matrices.teacherAvail[teacherId][day][slot] = payload
    matrices.roomAvail[roomId][day][slot] = payload
    if (groupId === 'ALL') {
        matrices.groupAvail[`${sectionId}_G1`][day][slot] = payload
        matrices.groupAvail[`${sectionId}_G2`][day][slot] = payload
    } else {
        matrices.groupAvail[`${sectionId}_${groupId}`][day][slot] = payload
    }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[array[i], array[j]] = [array[j], array[i]]
    }
}

function passesGapRules(sectionId, groupId, day, slot, groupAvail) {
    const key = `${sectionId}_${groupId}`
    const daySlots = Array.from({ length: SLOTS_PER_DAY }, (_, i) => !!groupAvail[key]?.[day]?.[i])
    daySlots[slot] = true
    const classCount = daySlots.filter(Boolean).length
    if (classCount > 5) return false
    const midBusy = [2, 3, 4].every(i => daySlots[i])
    if (midBusy) return false
    if (classCount < 2) return true
    let first = daySlots.indexOf(true)
    let last = daySlots.lastIndexOf(true)
    let totalGaps = (last - first + 1) - classCount
    if (totalGaps > 2) return false

    return true
}

function generateTimetableLogic(teachers, rooms, subjects, sections) {
    const teacherIds = Object.keys(teachers)
    const roomIds = Object.keys(rooms)
    const subjectIds = Object.keys(subjects)
    const sectionIds = Object.keys(sections)

    if (teacherIds.length === 0 || roomIds.length === 0 || subjectIds.length === 0 || sectionIds.length === 0) {
        return { feasibilityResult: "FAILED", conflictReport: ["Insufficient base data (teachers, rooms, subjects or sections missing)."] }
    }

    const groupIds = []
    sectionIds.forEach(sId => { groupIds.push(`${sId}_G1`); groupIds.push(`${sId}_G2`) })

    const classrooms = roomIds.filter(r => rooms[r].type === 'Classroom' || rooms[r].type?.toLowerCase() === 'classroom')
    const labs = roomIds.filter(r => rooms[r].type === 'Lab' || rooms[r].type?.toLowerCase() === 'lab')

    if (classrooms.length === 0 || labs.length === 0) {
        return { feasibilityResult: "FAILED", conflictReport: ["Need at least one Classroom and one Lab defined in Rooms."] }
    }

    const sessionsToSchedule = []
    const teacherLoads = {}
    teacherIds.forEach(t => teacherLoads[t] = 0)

    for (const sectionId of sectionIds) {
        for (const subjectId of subjectIds) {
            const L = parseInt(subjects[subjectId].lectures || 0, 10)
            const T = parseInt(subjects[subjectId].tutorials || 0, 10)
            const P = parseInt(subjects[subjectId].practicals || 0, 10)

            let reqHours = L + T + (P * 2)
            if (reqHours === 0) continue

            let bestTeacher = teacherIds[0]
            let minLoad = 999
            for (const tId of teacherIds) {
                if (teacherLoads[tId] < minLoad) {
                    minLoad = teacherLoads[tId]
                    bestTeacher = tId
                }
            }
            teacherLoads[bestTeacher] += reqHours

            for (let i = 0; i < L; i++) sessionsToSchedule.push({ sectionId, subjectId, type: 'Lecture', groupId: 'ALL', teacherId: bestTeacher })
            for (let i = 0; i < T; i++) sessionsToSchedule.push({ sectionId, subjectId, type: 'Tutorial', groupId: 'ALL', teacherId: bestTeacher })
            for (let i = 0; i < P; i++) {
                sessionsToSchedule.push({ sectionId, subjectId, type: 'Practical', groupId: 'G1', teacherId: bestTeacher })
                sessionsToSchedule.push({ sectionId, subjectId, type: 'Practical', groupId: 'G2', teacherId: bestTeacher })
            }
        }
    }

    let bestScore = -1
    let bestMatrices = null
    let finalConflicts = []

    for (let attempt = 0; attempt < 50; attempt++) {
        let matrices = {
            teacherAvail: initAvailability(teacherIds),
            roomAvail: initAvailability(roomIds),
            groupAvail: initAvailability(groupIds)
        }

        shuffle(sessionsToSchedule)
        sessionsToSchedule.sort((a, b) => a.type === 'Practical' ? -1 : 1)

        let scheduled = 0
        let conflicts = []

        for (const session of sessionsToSchedule) {
            let placed = false
            const slotCombos = []
            // Schedule Monday-Friday only (d < 5)
            for (let d = 0; d < 5; d++) {
                for (let s = 0; s < SLOTS_PER_DAY; s++) {
                    slotCombos.push({ d, s })
                }
            }
            shuffle(slotCombos)

            const possibleRooms = session.type === 'Practical' ? labs : classrooms

            for (const { d, s } of slotCombos) {
                let chosenRoom = null
                for (const rId of possibleRooms) {
                    if (!matrices.roomAvail[rId][d][s]) {
                        chosenRoom = rId
                        break
                    }
                }

                if (chosenRoom && canAllocate(session.teacherId, chosenRoom, session.sectionId, session.groupId, d, s, matrices)) {
                    allocate(session.teacherId, chosenRoom, session.sectionId, session.groupId, session.subjectId, d, s, matrices, session.type)
                    placed = true
                    scheduled++
                    break
                }
            }

            if (!placed) {
                conflicts.push(`Failed to schedule ${session.type} for S:${session.sectionId} sub:${session.subjectId}`)
            }
        }

        if (scheduled === sessionsToSchedule.length) {
            bestScore = scheduled
            bestMatrices = matrices
            finalConflicts = []
            break
        }

        if (scheduled > bestScore) {
            bestScore = scheduled
            bestMatrices = matrices
            finalConflicts = conflicts
        }
    }

    if (bestScore === -1 || !bestMatrices) {
        return { feasibilityResult: "FAILED", conflictReport: finalConflicts }
    }

    // ── Enforce Minimum 31 Periods (Self Study) ───────────────────────────────
    for (const sid of sectionIds) {
        let countG1 = 0
        let countG2 = 0
        for (let d = 0; d < 5; d++) {
            for (let s = 0; s < SLOTS_PER_DAY; s++) {
                if (bestMatrices.groupAvail[`${sid}_G1`]?.[d]?.[s]) countG1++
                if (bestMatrices.groupAvail[`${sid}_G2`]?.[d]?.[s]) countG2++
            }
        }

        let currentMax = Math.max(countG1, countG2)
        if (currentMax < 31) {
            let needed = 31 - currentMax
            outerFill:
            for (let s = SLOTS_PER_DAY - 1; s >= 0; s--) {
                for (let d = 0; d < 5; d++) {
                    if (bestMatrices.groupAvail[`${sid}_G2`]?.[d]?.[s]) countG2++
                }
            }

            let currentMax = Math.max(countG1, countG2)
            if (currentMax < 31) {
                let needed = 31 - currentMax
                outerFill:
                for (let s = SLOTS_PER_DAY - 1; s >= 0; s--) {
                    for (let d = 0; d < 5; d++) {
                        if (needed <= 0) break outerFill

                        const g1Free = !bestMatrices.groupAvail[`${sid}_G1`]?.[d]?.[s]
                        const g2Free = !bestMatrices.groupAvail[`${sid}_G2`]?.[d]?.[s]

                        if (g1Free && g2Free) {
                            const selfStudyPayload = {
                                teacherId: 'self',
                                roomId: 'self',
                                sectionId: sid,
                                subjectId: 'Self Study',
                                groupId: 'ALL',
                                type: 'Self Study'
                            }
                            bestMatrices.groupAvail[`${sid}_G1`][d][s] = selfStudyPayload
                            bestMatrices.groupAvail[`${sid}_G2`][d][s] = selfStudyPayload
                            needed--
                        }
                    }
                }
            }
        }

        const timetable = {}
        sectionIds.forEach(sectionId => {
            timetable[sectionId] = {}
            for (let d = 0; d < DAYS; d++) {
                timetable[sectionId][d] = {}
                for (let s = 0; s < SLOTS_PER_DAY; s++) {
                    const g1 = bestMatrices.groupAvail[`${sectionId}_G1`]?.[d]?.[s] || null
                    const g2 = bestMatrices.groupAvail[`${sectionId}_G2`]?.[d]?.[s] || null
                    if (g1 || g2) {
                        timetable[sectionId][d][s] = { g1, g2 }
                    }
                }
            }
        })

        const teacherWorkloadSummary = {}
        teacherIds.forEach(tId => {
            let count = 0
            for (let d = 0; d < DAYS; d++) {
                for (let s = 0; s < SLOTS_PER_DAY; s++) {
                    if (bestMatrices.teacherAvail[tId]?.[d]?.[s]) count++
                }
            }
            teacherWorkloadSummary[tId] = count
        })

        const roomUtilizationSummary = {}
        roomIds.forEach(rId => {
            let count = 0
            for (let d = 0; d < DAYS; d++) {
                for (let s = 0; s < SLOTS_PER_DAY; s++) {
                    if (bestMatrices.roomAvail[rId]?.[d]?.[s]) count++
                }
            }
            roomUtilizationSummary[rId] = count
        })

        const violations = []

        for (const sectionId of sectionIds) {
            for (let d = 0; d < DAYS; d++) {
                const g1 = Array.from({ length: SLOTS_PER_DAY }, (_, i) => !!bestMatrices.groupAvail[`${sectionId}_G1`]?.[d]?.[i])
                const g2 = Array.from({ length: SLOTS_PER_DAY }, (_, i) => !!bestMatrices.groupAvail[`${sectionId}_G2`]?.[d]?.[i])
                const mid = [2, 3, 4]
                const g1MidBusy = mid.every(i => g1[i])
                const g2MidBusy = mid.every(i => g2[i])
                if (g1MidBusy) violations.push(`Mid-day gap missing (G1) for section ${sectionId} on day ${d}`)
                if (g2MidBusy) violations.push(`Mid-day gap missing (G2) for section ${sectionId} on day ${d}`)
                const validateGaps = (arr, label) => {
                    const count = arr.filter(Boolean).length
                    if (count === 0) return
                    if (count < 4 || count > 5) violations.push(`Daily classes out of range (${label}) for section ${sectionId} on day ${d}`)
                    if (count < 2) return
                    const first = arr.indexOf(true)
                    const last = arr.lastIndexOf(true)
                    let totalGaps = (last - first + 1) - count
                    if (totalGaps > 2) {
                        violations.push(`More than 2 total gaps (${label}) for section ${sectionId} on day ${d}`)
                    }
                }
                validateGaps(g1, 'G1')
                validateGaps(g2, 'G2')
            }
        }

        for (const tId of teacherIds) {
            const w = teacherWorkloadSummary[tId] || 0
            if (w < 21 || w > 22) violations.push(`Teacher ${tId} workload ${w} outside 21–22`)
        }

        const feasibilityResult = violations.length === 0 && finalConflicts.length === 0 ? "SUCCESS" : (violations.length > 0 ? "FAILED" : "PARTIAL_SUCCESS")
        const conflictReport = [...violations, ...finalConflicts]

        return {
            timetable,
            teacherWorkloadSummary,
            roomUtilizationSummary,
            feasibilityResult,
            optimizationScore: Math.floor((bestScore / sessionsToSchedule.length) * 100),
            conflictReport
        }
    }

    module.exports = { generateTimetableLogic }
