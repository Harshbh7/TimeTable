import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const app = initializeApp({ databaseURL: "https://timetable-89d33-default-rtdb.firebaseio.com", projectId: "timetable-89d33" });
const db = getDatabase(app);

async function run() {
    const sub = await get(ref(db, 'subjects'));
    const sec = await get(ref(db, 'sections'));
    console.log("Subjects:");
    Object.values(sub.val() || {}).slice(0, 5).forEach(s => console.log(s));
    console.log("Sections:");
    Object.values(sec.val() || {}).slice(0, 5).forEach(s => console.log(s));
    process.exit(0);
}
run();
