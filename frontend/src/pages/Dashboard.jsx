import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';

const Dashboard = () => {
    const [counts, setCounts] = useState({
        teachers: 0,
        rooms: 0,
        subjects: 0,
        sections: 0
    });

    useEffect(() => {
        const refs = ['teachers', 'rooms', 'subjects', 'sections'];
        const unsubscribes = refs.map(path => {
            const dbRef = ref(db, path);
            return onValue(dbRef, (snapshot) => {
                const data = snapshot.val() || {};
                setCounts(prev => ({ ...prev, [path]: Object.keys(data).length }));
            });
        });

        return () => unsubscribes.forEach(unsub => unsub());
    }, []);

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 dark:text-white">Dashboard Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Total Teachers', value: counts.teachers },
                    { label: 'Total Rooms', value: counts.rooms },
                    { label: 'Total Subjects', value: counts.subjects },
                    { label: 'Total Sections', value: counts.sections }
                ].map(stat => (
                    <div key={stat.label} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                        <p className="text-3xl font-semibold dark:text-white">{stat.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Dashboard;
