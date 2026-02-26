import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

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

async function check() {
  const [subSnap, secSnap, timetableSnap] = await Promise.all([
      get(ref(db, 'subjects')),
      get(ref(db, 'sections')),
      get(ref(db, 'timetable'))
  ]);
  const timetable = timetableSnap.val() || {};
  const subjects = subSnap.val() || {};
  const sections = secSnap.val() || {};

  console.log("Analyzing missing classes...");
  let needed = {};
  for(let sec in sections) {
     for(let sub in subjects) {
         needed[`${sec}_${sub}_L`] = parseInt(subjects[sub].lectures || 0);
         needed[`${sec}_${sub}_T`] = parseInt(subjects[sub].tutorials || 0);
         needed[`${sec}_${sub}_P`] = parseInt(subjects[sub].practicals || 0);
     }
  }

  let found = {};
  for(let sec in timetable) {
     for(let d in timetable[sec]) {
        for(let s in timetable[sec][d]) {
           const cell = timetable[sec][d][s];
           if (cell.g1 && cell.g2 && cell.g1.subjectId === cell.g2.subjectId && cell.g1.roomId === cell.g2.roomId) {
               // Lecture or Tutorial
               const type = cell.g1.type === 'Lecture' ? 'L' : 'T';
               const key = `${sec}_${cell.g1.subjectId}_${type}`;
               found[key] = (found[key]||0) + 1;
           } else {
               if (cell.g1) {
                  const key = `${sec}_${cell.g1.subjectId}_P`;
                  found[key] = (found[key]||0) + 0.5;
               }
               if (cell.g2) {
                  const key = `${sec}_${cell.g2.subjectId}_P`;
                  found[key] = (found[key]||0) + 0.5;
               }
           }
        }
     }
  }

  let missing = 0;
  for(let k in needed) {
     if (needed[k] > 0 && (found[k]||0) < needed[k]) {
         console.log(`Missing ${k}: Needed ${needed[k]}, Found ${found[k]||0}`);
         missing++;
     }
  }
  console.log(`Total missing constraints: ${missing}`);
  process.exit(0);
}
check();
