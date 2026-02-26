const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { generateTimetableLogic } = require("./scheduler");

if (!admin.apps.length) {
    admin.initializeApp();
}

exports.generateTimetable = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.token.admin) { // Assuming admin token logic is present
        throw new functions.https.HttpsError('permission-denied', 'Only admins can generate timetable.');
    }

    try {
        const db = admin.database();

        // Fetch data
        const [teachersSnap, roomsSnap, subjectsSnap, sectionsSnap] = await Promise.all([
            db.ref("teachers").once("value"),
            db.ref("rooms").once("value"),
            db.ref("subjects").once("value"),
            db.ref("sections").once("value")
        ]);

        const teachers = teachersSnap.val() || {};
        const rooms = roomsSnap.val() || {};
        const subjects = subjectsSnap.val() || {};
        const sections = sectionsSnap.val() || {};

        // Run core logic
        const result = generateTimetableLogic(teachers, rooms, subjects, sections);

        // If successful and valid, save to DB
        if (result.feasibilityResult === "SUCCESS") {
            await db.ref("timetable").set(result.timetable);
        }

        return result;
    } catch (error) {
        console.error("Error generating timetable", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
