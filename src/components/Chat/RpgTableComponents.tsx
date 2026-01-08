
import React, { useState, useRef, useEffect } from 'react';
import type { RPGColumn } from '../../types/rpg';

// --- EDITABLE CELL ---

interface EditableCellProps {
    value: any;
    column: RPGColumn;
    onSave: (value: any) => void;
}

export const EditableCell: React.FC<EditableCellProps> = ({ value, column, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync value on prop change
    useEffect(() => {
        setTempValue(String(value ?? ''));
    }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            if (column.type !== 'boolean') {
                inputRef.current.select();
            }
        }
    }, [isEditing, column.type]);

    const handleStartEditing = () => {
        setTempValue(String(value ?? ''));
        setIsEditing(true);
    };

    const handleSave = () => {
        let finalVal: any = tempValue;
        
        if (column.type === 'number') {
            finalVal = parseFloat(tempValue);
            if (isNaN(finalVal)) finalVal = 0;
        } else if (column.type === 'boolean') {
            // Handled by checkbox change directly, but for safety
            finalVal = tempValue === 'true';
        }

        if (finalVal !== value) {
            onSave(finalVal);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setTempValue(String(value ?? ''));
            setIsEditing(false);
        }
    };

    // --- RENDERERS ---

    if (column.type === 'boolean') {
        const isChecked = value === true || value === 'true';
        return (
            <div 
                className="flex items-center justify-center h-full w-full cursor-pointer hover:bg-slate-700/50 p-2 rounded transition-colors"
                onClick={() => onSave(!isChecked)}
                role="checkbox"
                aria-checked={isChecked}
                aria-label={`Bật tắt ${column.label}`}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSave(!isChecked); }}
            >
                <input 
                    type="checkbox" 
                    checked={isChecked} 
                    onChange={() => {}} // Handled by div click to be easier
                    className="w-4 h-4 rounded bg-slate-700 border-slate-500 text-sky-500 focus:ring-sky-500 pointer-events-none"
                    tabIndex={-1}
                />
            </div>
        );
    }

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type={column.type === 'number' ? 'number' : 'text'}
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="w-full bg-slate-900 text-white border border-sky-500 rounded px-2 py-1 text-sm outline-none shadow-lg z-10 absolute inset-0"
                style={{ minHeight: '100%' }}
                aria-label={`Editing ${column.label}`}
            />
        );
    }

    // Display Mode
    return (
        <div 
            onClick={handleStartEditing}
            className="w-full h-full min-h-[2rem] px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 cursor-text transition-colors truncate rounded border border-transparent hover:border-slate-600"
            title={String(value)}
            role="textbox"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleStartEditing(); }}
        >
            {value === null || value === undefined || value === '' ? <span className="text-slate-600 italic text-xs">Trống</span> : String(value)}
        </div>
    );
};

// --- RPG ROW ---

interface RpgRowProps {
    row: any[]; // [UUID, Col1, Col2...]
    columns: RPGColumn[];
    rowIndex: number;
    onCellUpdate: (rowIdx: number, colIdx: number, value: any) => void;
    onDelete: (rowIdx: number) => void;
}

export const RpgRow: React.FC<RpgRowProps> = ({ row, columns, rowIndex, onCellUpdate, onDelete }) => {
    return (
        <tr className="group border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
            {/* Index Cell */}
            <td className="w-10 text-center text-xs text-slate-600 font-mono select-none">
                {rowIndex + 1}
            </td>

            {/* Data Cells */}
            {columns.map((col, colIdx) => (
                <td key={col.id} className="relative p-0 border-r border-slate-800 last:border-r-0 h-10">
                    <EditableCell 
                        value={row[colIdx + 1]} // Skip UUID at index 0
                        column={col}
                        onSave={(val) => onCellUpdate(rowIndex, colIdx, val)}
                    />
                </td>
            ))}

            {/* Actions Cell (Hidden by default, shown on hover) */}
            <td className="w-10 text-center p-0">
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(rowIndex); }}
                    className="w-full h-full text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center"
                    title="Xóa dòng này"
                    aria-label={`Xóa dòng số ${rowIndex + 1}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                    </svg>
                </button>
            </td>
        </tr>
    );
};
