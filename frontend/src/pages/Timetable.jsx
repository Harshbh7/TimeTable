import React, { useState, useEffect } from 'react';
import { ref, onValue, get, set, update } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { Play, Loader2, CheckCircle, AlertTriangle, Settings, ChevronDown, ChevronUp, PlusCircle, Trash2 } from 'lucide-react';
import { generateTimetableLogic } from '../utils/scheduler';

const Timetable = () => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState(null);
    const [timetableData, setTimetableData] = useState(null);
    const [mappings, setMappings] = useState({ teachers: {}, rooms: {}, subjects: {}, sections: {} });
    const [activeTab, setActiveTab] = useState('grid');
    const [setupOpen, setSetupOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Each group: { semester: string, sectionPattern: string, subjectPattern: string }
    const [groups, setGroups] = useState([{ semester: 'Sem-1', sectionPattern: '', subjectPattern: '' }]);

    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const SLOTS = ['09-10 AM', '10-11 AM', '11-12 PM', '12-01 PM', '01-02 PM', '02-03 PM', '03-04 PM', '04-05 PM'];

    useEffect(() => {
        const fetchMappings = async () => {
            try {
                const [tSnap, rSnap, subSnap, secSnap] = await Promise.all([
                    get(ref(db, 'teachers')),
                    get(ref(db, 'rooms')),
                    get(ref(db, 'subjects')),
                    get(ref(db, 'sections'))
                ]);
                setMappings({
                    teachers: tSnap.val() || {},
                    rooms: rSnap.val() || {},
                    subjects: subSnap.val() || {},
                    sections: secSnap.val() || {}
                });
            } catch (error) {
                console.error("Failed to map data", error);
            }
        };
        fetchMappings();

        // Listen for existing timetable in DB
        const ttRef = ref(db, 'timetable');
        const unsubscribe = onValue(ttRef, (snapshot) => {
            if (snapshot.exists()) {
                setTimetableData(snapshot.val());
            }
        });
        return () => unsubscribe();
    }, []);

    const handleGenerate = async () => {
        if (!window.confirm("Are you sure you want to generate a new timetable? This may take some time.")) return;
        setIsGenerating(true);
        setResult(null);
        try {
            // Fetch everything from DB manually
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

            let resultData = null;
            try {
                const gen = httpsCallable(functions, 'generateTimetable');
                const resp = await gen({});
                resultData = resp.data;
            } catch {
                resultData = generateTimetableLogic(teachers, rooms, subjects, sections);
            }

            // Save to DB — always save what was placed so the grid shows results
            if (resultData.timetable && Object.keys(resultData.timetable).length > 0) {
                await set(ref(db, 'timetable'), resultData.timetable);
            }

            console.log("Local Engine Response:", resultData);
            setResult({ type: 'success', data: resultData });
        } catch (error) {
            console.error("Error generating timetable", error);
            setResult({ type: 'error', message: error.message || 'An error occurred during generation.' });
        } finally {
            setIsGenerating(false);
        }
    };

    // ── Bulk Semester Assignment ─────────────────────────────────────────────
    const handleBulkAssign = async () => {
        setIsSaving(true);
        try {
            const [subSnap, secSnap] = await Promise.all([
                get(ref(db, 'subjects')),
                get(ref(db, 'sections'))
            ]);
            const subjects = subSnap.val() || {};
            const sections = secSnap.val() || {};

            const subjectUpdates = {};
            const sectionUpdates = {};

            for (const group of groups) {
                if (!group.semester.trim()) continue;
                const semTrimmed = group.semester.trim();

                // Match subjects: empty pattern → match all without semester; otherwise match by name/code substring
                for (const [id, sub] of Object.entries(subjects)) {
                    const pattern = group.subjectPattern.trim().toLowerCase();
                    const matchesAll = !pattern;
                    const matchesPattern = pattern && (
                        (sub.name || '').toLowerCase().includes(pattern) ||
                        (sub.code || '').toLowerCase().includes(pattern) ||
                        (sub.semester || '').toLowerCase().includes(pattern)
                    );
                    if (matchesAll || matchesPattern) {
                        subjectUpdates[`subjects/${id}/semester`] = semTrimmed;
                    }
                }

                // Match sections: empty pattern → match all without semester; otherwise match by name substring
                for (const [id, sec] of Object.entries(sections)) {
                    const pattern = group.sectionPattern.trim().toLowerCase();
                    const matchesAll = !pattern;
                    const matchesPattern = pattern && (sec.name || '').toLowerCase().includes(pattern);
                    if (matchesAll || matchesPattern) {
                        sectionUpdates[`sections/${id}/semester`] = semTrimmed;
                    }
                }
            }

            // Write in one atomic multi-path update
            await update(ref(db), { ...subjectUpdates, ...sectionUpdates });

            // Reload mappings so UI reflects new semester tags
            const [tSnap, rSnap, subSnap2, secSnap2] = await Promise.all([
                get(ref(db, 'teachers')), get(ref(db, 'rooms')),
                get(ref(db, 'subjects')), get(ref(db, 'sections'))
            ]);
            setMappings({
                teachers: tSnap.val() || {}, rooms: rSnap.val() || {},
                subjects: subSnap2.val() || {}, sections: secSnap2.val() || {}
            });

            alert(`✅ Done! Updated ${Object.keys(subjectUpdates).length} subject(s) and ${Object.keys(sectionUpdates).length} section(s). Now click "Run Scheduling Engine" to generate a timetable.`);
        } catch (err) {
            alert('Error saving semester assignments: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const updateGroup = (i, field, val) => {
        const next = [...groups];
        next[i] = { ...next[i], [field]: val };
        setGroups(next);
    };
    // ────────────────────────────────────────────────────────────────────────

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold dark:text-white">Timetable Setup</h2>
                <div className="flex gap-3">
                    <button
                        onClick={() => setSetupOpen(o => !o)}
                        className="px-4 py-2 rounded-lg font-semibold flex items-center gap-2 border dark:border-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                        <Settings size={18} />
                        Quick Setup
                        {setupOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={`px-6 py-2 rounded-lg font-semibold flex items-center gap-2 text-white
                ${isGenerating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
                        {isGenerating ? 'Generating...' : 'Run Scheduling Engine'}
                    </button>
                </div>
            </div>

            {/* ── Quick Data Setup Panel ──────────────────────────────────────── */}
            {setupOpen && (
                <div className="mb-6 border dark:border-gray-700 rounded-xl p-5 bg-blue-50 dark:bg-blue-950/30">
                    <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-1">📋 Quick Semester Assignment</h3>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
                        Assign a semester tag to subjects &amp; sections so the scheduler knows which subjects belong to which sections.
                        Leave patterns empty to apply to <strong>all</strong> subjects/sections.
                    </p>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm mb-3">
                            <thead>
                                <tr className="text-left text-blue-900 dark:text-blue-300">
                                    <th className="p-2 font-semibold">Semester Label</th>
                                    <th className="p-2 font-semibold">Section name contains…</th>
                                    <th className="p-2 font-semibold">Subject name/code contains…</th>
                                    <th className="p-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((g, i) => (
                                    <tr key={i}>
                                        <td className="p-1">
                                            <input
                                                value={g.semester}
                                                onChange={e => updateGroup(i, 'semester', e.target.value)}
                                                placeholder="e.g. Sem-3"
                                                className="border rounded p-1.5 w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <input
                                                value={g.sectionPattern}
                                                onChange={e => updateGroup(i, 'sectionPattern', e.target.value)}
                                                placeholder="(empty = all sections)"
                                                className="border rounded p-1.5 w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <input
                                                value={g.subjectPattern}
                                                onChange={e => updateGroup(i, 'subjectPattern', e.target.value)}
                                                placeholder="(empty = all subjects)"
                                                className="border rounded p-1.5 w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <button type="button" onClick={() => setGroups(g => g.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setGroups(g => [...g, { semester: '', sectionPattern: '', subjectPattern: '' }])}
                            className="flex items-center gap-1 text-blue-700 dark:text-blue-400 text-sm hover:underline"
                        >
                            <PlusCircle size={15} /> Add Row
                        </button>
                        <button
                            type="button"
                            onClick={handleBulkAssign}
                            disabled={isSaving}
                            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-semibold flex items-center gap-2 text-sm"
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                            {isSaving ? 'Saving...' : 'Apply & Save'}
                        </button>
                    </div>
                </div>
            )}

            {result && (
                <div className={`p-4 rounded-lg mb-6 flex items-start gap-3 ${result.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'}`}>
                    {result.type === 'success' ? <CheckCircle className="mt-0.5 shrink-0" /> : <AlertTriangle className="mt-0.5 shrink-0" />}
                    <div className="w-full space-y-2">
                        <h4 className="font-bold">{result.type === 'success' ? 'Generation Successful' : 'Generation Failed'}</h4>
                        {result.type === 'success' && result.data && (
                            <p className="text-sm">
                                Optimization Score: <strong>{result.data.optimizationScore}%</strong> &nbsp;|&nbsp; Status: <strong>{result.data.feasibilityResult}</strong>
                            </p>
                        )}
                        {result.type === 'error' && <p className="text-sm">{result.message}</p>}

                        {/* Unplaced sessions */}
                        {result.data?.conflictReport?.length > 0 && (
                            <details className="mt-1">
                                <summary className="text-sm font-semibold text-red-600 dark:text-red-400 cursor-pointer select-none">
                                    ⚠ {result.data.conflictReport.length} unplaced session(s) — click to expand
                                </summary>
                                <ul className="list-disc list-inside mt-1 text-sm text-red-600 dark:text-red-400 pl-2">
                                    {result.data.conflictReport.map((c, i) => <li key={i}>{c}</li>)}
                                </ul>
                            </details>
                        )}

                        {/* Gap validation */}
                        {result.data?.gapValidationReport?.length > 0 && (
                            <details className="mt-1">
                                <summary className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 cursor-pointer select-none">
                                    ⚡ {result.data.gapValidationReport.length} gap rule violation(s) — click to expand
                                </summary>
                                <ul className="list-disc list-inside mt-1 text-sm text-yellow-700 dark:text-yellow-400 pl-2">
                                    {result.data.gapValidationReport.map((c, i) => <li key={i}>{c}</li>)}
                                </ul>
                            </details>
                        )}
                        {result.data?.gapValidationReport?.length === 0 && result.data?.optimizationScore > 0 && (
                            <p className="text-xs text-green-600 dark:text-green-400">✅ All mid-day gap constraints satisfied</p>
                        )}

                        {/* Off-day schedule removed */}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-4 border-b dark:border-gray-700 mb-6">
                {['grid', 'teacher_workload', 'room_utilization'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-3 font-medium px-2 ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                    >
                        {tab === 'grid' && 'Section Views'}
                        {tab === 'teacher_workload' && 'Teacher Workloads'}
                        {tab === 'room_utilization' && 'Room Utilization'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="mt-4">
                {activeTab === 'grid' && (
                    <div>
                        {!timetableData ? (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-8">No timetable data found. Run the engine to generate one.</p>
                        ) : (
                            <div className="space-y-8">
                                {Object.entries(timetableData).map(([sectionId, daysObj]) => {
                                    const sectionName = mappings.sections[sectionId]?.name || sectionId;
                                    return (
                                        <div key={sectionId} className="space-y-8 border-b-4 dark:border-gray-700 pb-8 mb-8 last:border-0 last:pb-0 last:mb-0">
                                            {['g1', 'g2'].map((groupKey) => {
                                                const groupTitle = groupKey === 'g1' ? 'G1' : 'G2';

                                                return (
                                                    <div key={`${sectionId}-${groupKey}`} className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                                                        <div className="bg-gray-100 dark:bg-gray-900 p-3 font-bold text-gray-800 dark:text-gray-200 border-b dark:border-gray-700 flex justify-between">
                                                            <span>Section: {sectionName} ({groupTitle})</span>
                                                            <span className="text-sm font-normal text-gray-500">Legends: C - Course Code, R - Room, T - Teacher</span>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left text-xs border-collapse">
                                                                <thead className="bg-gray-50 dark:bg-gray-800">
                                                                    <tr>
                                                                        <th className="border p-2 dark:border-gray-700 font-bold min-w-[90px]">Timing</th>
                                                                        {DAYS.map(day => <th key={day} className="border p-2 dark:border-gray-700 font-bold min-w-[150px]">{day}</th>)}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {SLOTS.map((slotLabel, sIndex) => (
                                                                        <tr key={slotLabel}>
                                                                            <td className="border p-2 dark:border-gray-700 font-medium bg-gray-50 dark:bg-gray-800/50 whitespace-nowrap">{slotLabel}</td>
                                                                            {DAYS.map((dayName, dIndex) => {
                                                                                const session = daysObj[dIndex]?.[sIndex]?.[groupKey];
                                                                                return (
                                                                                    <td key={dIndex} className="border p-2 dark:border-gray-700 align-top hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                                                                                        {session && session.type !== 'Self Study' ? (
                                                                                            <div className="flex flex-col gap-2">
                                                                                                {session.group === 'Combined' ? (
                                                                                                    <div className="bg-gray-50/50 dark:bg-gray-800/30 p-1.5 rounded-md border border-gray-100 dark:border-gray-800">
                                                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                                                            <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-[9px] font-bold uppercase tracking-wider">G:All</span>
                                                                                                            <p className="font-bold text-gray-900 dark:text-gray-100 text-xs">{session.type || 'Lecture'}</p>
                                                                                                        </div>
                                                                                                        <p className="text-gray-600 dark:text-gray-400 font-mono text-[10px] leading-tight">
                                                                                                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{mappings.subjects[session.subjectId]?.code || session.subjectId}</span>
                                                                                                            <span className="mx-1">•</span> R:{mappings.rooms[session.roomId]?.name || session.roomId}
                                                                                                            <br />
                                                                                                            <span className="text-[9px]">T:{mappings.teachers[session.teacherId]?.initial || session.teacherId}</span>
                                                                                                        </p>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <div className={groupKey === 'g1' ? "bg-purple-50/30 dark:bg-purple-900/10 p-1.5 rounded-md border border-purple-100 dark:border-purple-900/30" : "bg-blue-50/30 dark:bg-blue-900/10 p-1.5 rounded-md border border-blue-100 dark:border-blue-900/30"}>
                                                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                                                            <span className={groupKey === 'g1' ? "px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-[9px] font-bold uppercase tracking-wider" : "px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-[9px] font-bold uppercase tracking-wider"}>{session.group}</span>
                                                                                                            <p className={groupKey === 'g1' ? "font-bold text-purple-800 dark:text-purple-200 text-xs truncate" : "font-bold text-blue-800 dark:text-blue-200 text-xs truncate"}>{session.type || 'Session'}</p>
                                                                                                        </div>
                                                                                                        <p className="text-gray-600 dark:text-gray-400 font-mono text-[10px] leading-tight">
                                                                                                            <span className={groupKey === 'g1' ? "text-purple-600 dark:text-purple-400 font-semibold" : "text-blue-600 dark:text-blue-400 font-semibold"}>{mappings.subjects[session.subjectId]?.code || session.subjectId}</span>
                                                                                                            <br />
                                                                                                            <span className="text-[9px]">R:{mappings.rooms[session.roomId]?.name || session.roomId} • T:{mappings.teachers[session.teacherId]?.initial || session.teacherId}</span>
                                                                                                        </p>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </td>
                                                                                );
                                                                            })}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'teacher_workload' && (
                    <div>
                        {!result?.data?.teacherWorkloadSummary ? (
                            <p className="text-gray-500 dark:text-gray-400">Workload data is not available. Generate a timetable first.</p>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {Object.entries(result.data.teacherWorkloadSummary).map(([tId, count]) => (
                                    <div key={tId} className="border p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-center">
                                        <p className="font-bold dark:text-white">{mappings.teachers[tId]?.name || tId}</p>
                                        <p className="text-xs text-gray-500 mb-2">Initials: {mappings.teachers[tId]?.initial}</p>
                                        <p className={`text-xl font-bold ${count >= 21 && count <= 22 ? 'text-green-600' : count > 22 ? 'text-red-500' : 'text-yellow-600'}`}>{count} hrs</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'room_utilization' && (
                    <div>
                        {!result?.data?.roomUtilizationSummary ? (
                            <p className="text-gray-500 dark:text-gray-400">Room utilization data is not available. Generate a timetable first.</p>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {Object.entries(result.data.roomUtilizationSummary).map(([rId, count]) => (
                                    <div key={rId} className="border p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-center">
                                        <p className="font-bold dark:text-white">{mappings.rooms[rId]?.name || rId}</p>
                                        <p className="text-xs text-gray-500 mb-2">{mappings.rooms[rId]?.type}</p>
                                        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{count} slots</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div >
    );
};

export default Timetable;
