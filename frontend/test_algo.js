import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";
import { generateTimetableLogic } from "./src/utils/scheduler.js";

const firebaseConfig = {
    apiKey: "dummy",
    authDomain: "timetable-89d33.firebaseapp.com",
    databaseURL: "https://timetable-89d33-default-rtdb.firebaseio.com",
    projectId: "timetable-89d33",
    storageBucket: "timetable-89d33.firebasestorage.app",
    messagingSenderId: "123",
    appId: "123"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function testAlgorithm() {
    console.log("Fetching live data from Firebase...");
    const [tSnap, rSnap, subSnap, secSnap] = await Promise.all([
        get(ref(db, 'teachers')),
        get(ref(db, 'rooms')),
        get(ref(db, 'subjects')),
        get(ref(db, 'sections'))
    ]);

    const teachers = tSnap.val() || {};
    const rooms = rSnap.val() || {};
    const subjects = subSnap.val() || {};
    const sections = secSnap.val() || {};

    console.log("Sample Section:", Object.values(sections)[0]);
    console.log("Data fetched. Running scheduling algorithm...");
    const startTime = Date.now();
    const result = generateTimetableLogic(teachers, rooms, subjects, sections);
    const endTime = Date.now();

    console.log(`Execution Time: ${endTime - startTime}ms`);
    console.log(`Feasibility Result: ${result.feasibilityResult}`);

    if (result.feasibilityResult === "FAILED") {
        console.log("Conflict Report:", result.conflictReport);
    } else {
        console.log(`Optimization Score: ${result.optimizationScore}%`);
        console.log(`Result Status: ${result.feasibilityResult}`);
        if (result.conflictReport && result.conflictReport.length > 0) {
            console.log("Warnings/Conflicts:", result.conflictReport);
        }

        let teacherLoads = result.teacherWorkloadSummary || {};
        console.log("\nTeacher Loads:");
        Object.keys(teachers).forEach(t => {
            console.log(`${teachers[t].name}: ${teacherLoads[t] || 0} hours`);
        });
    }

    process.exit(0);
}

testAlgorithm();
