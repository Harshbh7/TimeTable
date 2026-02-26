
import React, { useState, useEffect } from 'react';
import { ref, onValue, push, remove, update } from 'firebase/database';
import { db } from '../firebase';
import { Plus, Trash2, Edit, Upload } from 'lucide-react';
import BulkUploadModal from '../components/BulkUploadModal';

const Subjects = () => {
    const [subjects, setSubjects] = useState({});
    const [formData, setFormData] = useState({
        name: '', code: '', lectures: 0, tutorials: 0, practicals: 0,
        credits: 0, type: 'CR', faculty: '', semester: ''
    });
    const [editingId, setEditingId] = useState(null);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onValue(ref(db, 'subjects'), snap => setSubjects(snap.val() || {}));
        return () => unsubscribe();
    }, []);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { ...formData };
        if (editingId) {
            update(ref(db, `subjects/${editingId}`), payload);
            setEditingId(null);
        } else {
            push(ref(db, 'subjects'), payload);
        }
        setFormData({ name: '', code: '', lectures: 0, tutorials: 0, practicals: 0, credits: 0, type: 'CR', faculty: '', semester: '' });
    };

    const handleEdit = (id, subject) => {
        setFormData({
            name: subject.name || '',
            code: subject.code || '',
            lectures: subject.lectures || 0,
            tutorials: subject.tutorials || 0,
            practicals: subject.practicals || 0,
            credits: subject.credits || 0,
            type: subject.type || 'CR',
            faculty: subject.faculty || '',
            semester: subject.semester || ''
        });
        setEditingId(id);
    };

    const handleDelete = (id) => {
        if (window.confirm('Are you sure you want to delete this subject?')) {
            remove(ref(db, `subjects/${id}`));
        }
    };

    const handleBulkUpload = (data) => {
        data.forEach(row => {
            const payload = {
                name: row['Name'] || row['name'] || row['Course Title'] || '',
                code: row['Code'] || row['code'] || row['Course Code'] || '',
                lectures: parseInt(row['L'] || row['Lectures'] || row['lectures'] || 0, 10),
                tutorials: parseInt(row['T'] || row['Tutorials'] || row['tutorials'] || 0, 10),
                practicals: parseInt(row['P'] || row['Practicals'] || row['practicals'] || 0, 10),
                credits: parseInt(row['Credits'] || row['credits'] || 0, 10),
                type: row['Type'] || row['type'] || 'CR',
                faculty: row['Faculty'] || row['faculty'] || '',
                semester: row['Semester'] || row['semester'] || row['Sem'] || ''
            };
            if (payload.name && payload.code) push(ref(db, 'subjects'), payload);
        });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 relative">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold dark:text-white">Manage Subjects</h2>
                <button
                    onClick={() => setIsBulkModalOpen(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
                >
                    <Upload size={16} />
                    Import CSV/Excel
                </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-9 gap-3 mb-8 items-end">
                <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Course Title</label>
                    <input required name="name" placeholder="e.g. PROGRAMMING IN JAVA" value={formData.name} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Course Code</label>
                    <input required name="code" placeholder="CAP477" value={formData.code} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Semester</label>
                    <input required name="semester" placeholder="e.g. Sem-3" value={formData.semester} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Type</label>
                    <input required name="type" placeholder="CR" value={formData.type} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">L</label>
                    <input required type="number" min="0" name="lectures" value={formData.lectures} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">T</label>
                    <input required type="number" min="0" name="tutorials" value={formData.tutorials} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">P</label>
                    <input required type="number" min="0" name="practicals" value={formData.practicals} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Credits</label>
                    <input required type="number" min="0" name="credits" value={formData.credits} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div className="md:col-span-3">
                    <label className="text-xs text-gray-500 mb-1 block">Faculty ( Block - Room - Cabin )</label>
                    <input name="faculty" placeholder="Dr. XYZ ( 38-601-CH5 )" value={formData.faculty} onChange={handleChange} className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div className="md:col-span-6 flex justify-end">
                    <button type="submit" className="bg-blue-600 text-white p-2 px-6 rounded hover:bg-blue-700 flex items-center justify-center gap-2 w-full md:w-auto mt-2">
                        {editingId ? <Edit size={16} /> : <Plus size={16} />}
                        {editingId ? 'Update Subject' : 'Add Subject'}
                    </button>
                </div>
            </form>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-100 dark:bg-gray-700 border-b dark:border-gray-600">
                        <tr>
                            <th className="p-3 font-semibold dark:text-gray-200">Code</th>
                            <th className="p-3 font-semibold dark:text-gray-200">Semester</th>
                            <th className="p-3 font-semibold dark:text-gray-200">Type</th>
                            <th className="p-3 font-semibold dark:text-gray-200 min-w-[200px]">Course Title</th>
                            <th className="p-3 font-semibold dark:text-gray-200 text-center">L</th>
                            <th className="p-3 font-semibold dark:text-gray-200 text-center">T</th>
                            <th className="p-3 font-semibold dark:text-gray-200 text-center">P</th>
                            <th className="p-3 font-semibold dark:text-gray-200 text-center">Credits</th>
                            <th className="p-3 font-semibold dark:text-gray-200 min-w-[200px]">Faculty</th>
                            <th className="p-3 font-semibold dark:text-gray-200">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(subjects).map(([id, subject]) => (
                            <tr key={id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                                <td className="p-3 dark:text-gray-300 font-medium">{subject.code}</td>
                                <td className="p-3">
                                    {subject.semester
                                        ? <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium px-2 py-1 rounded">{subject.semester}</span>
                                        : <span className="text-red-400 text-xs font-semibold">⚠ No semester</span>
                                    }
                                </td>
                                <td className="p-3 dark:text-gray-300">{subject.type || 'CR'}</td>
                                <td className="p-3 dark:text-gray-300 whitespace-normal">{subject.name}</td>
                                <td className="p-3 dark:text-gray-300 text-center">{subject.lectures}</td>
                                <td className="p-3 dark:text-gray-300 text-center">{subject.tutorials}</td>
                                <td className="p-3 dark:text-gray-300 text-center">{subject.practicals}</td>
                                <td className="p-3 dark:text-gray-300 text-center">{subject.credits || 0}</td>
                                <td className="p-3 dark:text-gray-400 text-xs whitespace-normal">{subject.faculty || 'Unassigned'}</td>
                                <td className="p-3 flex gap-3">
                                    <button onClick={() => handleEdit(id, subject)} className="text-blue-500 hover:text-blue-700"><Edit size={16} /></button>
                                    <button onClick={() => handleDelete(id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {Object.keys(subjects).length === 0 && <p className="text-center p-4 text-gray-500">No subjects found.</p>}
            </div>

            <BulkUploadModal
                isOpen={isBulkModalOpen}
                onClose={() => setIsBulkModalOpen(false)}
                onUpload={handleBulkUpload}
                entityName="Subjects"
                expectedColumns={['Code', 'Name', 'Semester', 'L', 'T', 'P']}
            />
        </div>
    );
};

export default Subjects;
