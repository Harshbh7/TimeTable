import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Upload, X, ShieldAlert } from 'lucide-react';

const BulkUploadModal = ({ isOpen, onClose, onUpload, expectedColumns, entityName }) => {
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setError(null);
        const fileExtension = file.name.split('.').pop().toLowerCase();

        if (fileExtension === 'csv') {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    validateAndUpload(results.data);
                },
                error: (err) => {
                    setError(`Failed to parse CSV: ${err.message}`);
                }
            });
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const bstr = evt.target.result;
                    const workbook = XLSX.read(bstr, { type: 'binary' });
                    const wsname = workbook.SheetNames[0];
                    const ws = workbook.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json(ws);
                    validateAndUpload(data);
                } catch (err) {
                    setError(`Failed to parse Excel: ${err.message}`);
                }
            };
            reader.readAsBinaryString(file);
        } else {
            setError("Unsupported file format. Please upload .csv or .xlsx.");
        }

        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const validateAndUpload = (data) => {
        if (!data || data.length === 0) {
            return setError("The imported file is empty.");
        }

        // Basic column validation (case-insensitive checking)
        const firstRowKeys = Object.keys(data[0]).map(k => k.toLowerCase().trim());
        const missingColumns = expectedColumns.filter(
            col => !firstRowKeys.includes(col.toLowerCase().trim())
        );

        if (missingColumns.length > 0) {
            return setError(`Missing expected columns: ${missingColumns.join(', ')}. Please ensure the header row exactly matches.`);
        }

        onUpload(data);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                    <X size={24} />
                </button>

                <h2 className="text-xl font-bold mb-2 dark:text-white">Bulk Import {entityName}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Upload a CSV or Excel file to batch import data.
                </p>

                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center bg-gray-50 dark:bg-gray-700/50">
                    <Upload className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                    <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">Click to select file</p>
                    <p className="text-xs text-gray-500 mt-1 mb-4">.csv, .xlsx, or .xls</p>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                        className="hidden"
                        id="file-upload"
                    />
                    <label
                        htmlFor="file-upload"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer font-medium transition-colors text-sm inline-block"
                    >
                        Browse Files
                    </label>
                </div>

                <div className="mt-6 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                    <p className="text-xs text-blue-800 dark:text-blue-300 font-medium mb-1">Expected column headers:</p>
                    <div className="flex flex-wrap gap-1">
                        {expectedColumns.map(col => (
                            <span key={col} className="bg-white dark:bg-gray-800 px-2 py-0.5 rounded text-[10px] border border-blue-200 dark:border-blue-700 text-gray-700 dark:text-gray-300">
                                {col}
                            </span>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm flex gap-2 items-start border border-red-100 dark:border-red-800">
                        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BulkUploadModal;
