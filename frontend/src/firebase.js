import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getFunctions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

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
export const db = getDatabase(app);
export const functions = getFunctions(app);
export const auth = getAuth(app);
