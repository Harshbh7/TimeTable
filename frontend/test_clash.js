import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyClJs1-oPGS5eG2IOpuge-jNZKBM13pRcY",
    authDomain: "timetable-89d33.firebaseapp.com",
    databaseURL: "https://timetable-89d33-default-rtdb.firebaseio.com",
    projectId: "timetable-89d33",
    storageBucket: "timetable-89d33.firebasestorage.app",
    messagingSenderId: "464629489215",
    appId: "1:464629489215:web:b991670f751d5d94cd628a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function check() {
    const timetableSnap = await get(ref(db, 'timetable'));
    const timetable = timetableSnap.val() || {};

    console.log(`Analyzing timetable...`);

    const teacherSlots = {};
    const roomSlots = {};
    const groupSlots = {};

    let clashes = 0;

    for (let secId in timetable) {
        for (let day in timetable[secId]) {
            for (let slot in timetable[secId][day]) {
                const cell = timetable[secId][day][slot];
                if (!cell) continue;

                const g1 = cell.g1;
                const g2 = cell.g2;

                if (g1) {
                    const tId = g1.teacherId;
                    const rId = g1.roomId;

                    if (!teacherSlots[`${day}_${slot}_${tId}`]) {
                        teacherSlots[`${day}_${slot}_${tId}`] = [];
                    }
                    teacherSlots[`${day}_${slot}_${tId}`].push(`Sec:${secId} Group:1 (Sub:${g1.subjectId})`);

                    if (!roomSlots[`${day}_${slot}_${rId}`]) {
                        roomSlots[`${day}_${slot}_${rId}`] = [];
                    }
                    roomSlots[`${day}_${slot}_${rId}`].push(`Sec:${secId} Group:1`);

                    if (!groupSlots[`${day}_${slot}_${secId}_G1`]) {
                        groupSlots[`${day}_${slot}_${secId}_G1`] = [];
                    }
                    groupSlots[`${day}_${slot}_${secId}_G1`].push(`Sub:${g1.subjectId}`);
                }

                if (g2) {
                    const tId = g2.teacherId;
                    const rId = g2.roomId;

                    if (!teacherSlots[`${day}_${slot}_${tId}`]) {
                        teacherSlots[`${day}_${slot}_${tId}`] = [];
                    }
                    teacherSlots[`${day}_${slot}_${tId}`].push(`Sec:${secId} Group:2 (Sub:${g2.subjectId})`);

                    if (!roomSlots[`${day}_${slot}_${rId}`]) {
                        roomSlots[`${day}_${slot}_${rId}`] = [];
                    }
                    roomSlots[`${day}_${slot}_${rId}`].push(`Sec:${secId} Group:2`);

                    if (!groupSlots[`${day}_${slot}_${secId}_G2`]) {
                        groupSlots[`${day}_${slot}_${secId}_G2`] = [];
                    }
                    groupSlots[`${day}_${slot}_${secId}_G2`].push(`Sub:${g2.subjectId}`);
                }
            }
        }
    }

    // Detect clashes
    for (let key in teacherSlots) {
        const uniqueItems = new Set(teacherSlots[key]);
        const uniqueSections = new Set([...uniqueItems].map(i => i.split(' ')[0]));
        // A teacher can teach G1 and G2 of the same section simultaneously, but NOT two different sections at the same time
        if (uniqueSections.size > 1) {
            console.log(`Teacher Clash at ${key}:`, uniqueItems);
            clashes++;
        }
    }

    for (let key in roomSlots) {
        const uniqueItems = new Set(roomSlots[key]);
        const uniqueSections = new Set([...uniqueItems].map(i => i.split(' ')[0]));
        if (uniqueSections.size > 1) {
            console.log(`Room Clash at ${key}:`, uniqueItems);
            clashes++;
        }
    }

    for (let key in groupSlots) {
        if (groupSlots[key].length > 1) {
            console.log(`Student Group Clash at ${key}:`, groupSlots[key]);
            clashes++;
        }
    }

    console.log(`Total Clashes Found: ${clashes}`);
    process.exit(0);
}

check().catch(console.error);
