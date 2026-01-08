
import React, { useState, useMemo } from 'react';
import type { RPGDatabase, RPGTable } from '../../types/rpg';

interface RpgDashboardProps {
    data: RPGDatabase | undefined;
    isOpen: boolean;
    onClose: () => void;
}

// --- SUB COMPONENTS ---

const StatBar: React.FC<{ label: string; value: any }> = ({ label, value }) => {
    let numVal = 0;
    let maxVal = 100;
    
    if (typeof value === 'number') {
        numVal = value;
    } else if (typeof value === 'string') {
        if (value.includes('/')) {
            const parts = value.split('/');
            numVal = parseFloat(parts[0]);
            maxVal = parseFloat(parts[1]) || 100;
        } else {
            numVal = parseFloat(value);
        }
    }

    const isValidNumber = !isNaN(numVal);
    const percent = isValidNumber ? Math.min(100, Math.max(0, (numVal / maxVal) * 100)) : 0;

    let colorClass = "bg-slate-500";
    const l = label.toLowerCase();
    if (l.includes('hp') || l.includes('máu')) colorClass = "bg-red-500";
    else if (l.includes('mp') || l.includes('mana')) colorClass = "bg-blue-500";
    else if (l.includes('exp')) colorClass = "bg-yellow-500";

    return (
        <div className="flex items-center justify-between gap-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <span className="text-xs font-bold text-slate-300 w-24 truncate" title={label}>{label}</span>
            {isValidNumber ? (
                <div className="flex-grow flex flex-col gap-1">
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700">
                        <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${percent}%` }}></div>
                    </div>
                    <div className="flex justify-end">
                        <span className="text-[10px] font-mono text-slate-400">{value}</span>
                    </div>
                </div>
            ) : (
                <span className="text-xs text-slate-200 font-mono bg-slate-900 px-2 py-1 rounded">{String(value)}</span>
            )}
        </div>
    );
};

// Cập nhật để đọc dữ liệu từ mảng
const GridCard: React.FC<{ row: any[]; columns: any[] }> = ({ row, columns }) => {
    // Row[0] là ID, dữ liệu bắt đầu từ Row[1]
    // Tìm index của các cột quan trọng
    const titleIdx = columns ? columns.findIndex(c => c.id === 'name' || c.id === 'ten_vat_pham' || c.id === 'ten_ky_nang') : -1;
    const descIdx = columns ? columns.findIndex(c => c.id === 'description' || c.id === 'mo_ta' || c.id === 'hieu_ung') : -1;
    const qtyIdx = columns ? columns.findIndex(c => c.id === 'quantity' || c.id === 'so_luong') : -1;

    // Fallback: nếu không tìm thấy, lấy cột đầu tiên (index 0 trong columns -> index 1 trong row)
    const titleVal = titleIdx !== -1 ? row[titleIdx + 1] : row[1];
    const descVal = descIdx !== -1 ? row[descIdx + 1] : '';
    const qtyVal = qtyIdx !== -1 ? row[qtyIdx + 1] : null;

    return (
        <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl hover:border-sky-500/50 transition-colors group relative overflow-hidden">
            <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-sm text-sky-300 line-clamp-1">{titleVal || '???'}</h4>
                {qtyVal && <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 font-mono">x{qtyVal}</span>}
            </div>
            {descVal && (
                <p className="text-xs text-slate-400 line-clamp-3">{descVal}</p>
            )}
        </div>
    );
};

const TableView: React.FC<{ table: RPGTable }> = ({ table }) => {
    const { config, data } = table;
    const mode = 'list'; // Tạm thời default list, có thể thông minh hơn sau

    if (!data.rows || data.rows.length === 0) {
        return <div className="text-center text-slate-500 italic py-8">Chưa có dữ liệu trong bảng này.</div>;
    }

    // Grid View cho Inventory (Check tên bảng)
    if (config.id.includes('inventory') || config.id.includes('item') || config.id.includes('tui_do')) {
         return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-2">
                {data.rows.map(row => (
                    <GridCard key={row[0]} row={row} columns={config.columns} />
                ))}
            </div>
        );
    }

    // List View
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase bg-slate-900/50">
                        {config.columns.map(col => (
                            <th key={col.id} className="p-3 font-semibold">{col.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-800">
                    {data.rows.map(row => (
                        <tr key={row[0]} className="hover:bg-slate-800/50 transition-colors">
                            {/* Bỏ qua phần tử đầu tiên (ID) */}
                            {row.slice(1).map((cell, idx) => (
                                <td key={idx} className="p-3 text-slate-300">
                                    {String(cell ?? '-')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// --- MAIN COMPONENT ---

export const RpgDashboard: React.FC<RpgDashboardProps> = ({ data, isOpen, onClose }) => {
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    useMemo(() => {
        if (isOpen && !activeTabId && data?.tables?.length) {
            setActiveTabId(data.tables[0].config.id);
        }
    }, [isOpen, data]);

    if (!isOpen || !data) return null;

    const activeTable = data.tables ? data.tables.find(t => t.config.id === activeTabId) : undefined;

    return (
        <div className="fixed inset-y-0 right-0 z-[100] w-[500px] max-w-full bg-slate-900/95 backdrop-blur-xl border-l border-slate-700 shadow-2xl flex flex-col transform transition-transform animate-slide-in-right">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <div>
                    <h2 className="text-xl font-bold text-sky-400 flex items-center gap-2">
                        <span>⚔️</span> Mythic Dashboard (V2)
                    </h2>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                        DB v{data.version} • Update: {data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : 'N/A'}
                    </p>
                </div>
                <button 
                    onClick={onClose} 
                    className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
                    aria-label="Đóng bảng điều khiển RPG"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <div className="flex-grow flex overflow-hidden">
                <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-3 shrink-0 overflow-y-auto custom-scrollbar">
                    {data.tables && data.tables.map(table => {
                        const isActive = table.config.id === activeTabId;
                        // Simple icon logic based on name
                        const icon = table.config.name.includes('Thông tin') ? '👤' : 
                                     table.config.name.includes('Túi') ? '🎒' : '📊';
                        
                        return (
                            <button
                                key={table.config.id}
                                onClick={() => setActiveTabId(table.config.id)}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all duration-200 relative group ${
                                    isActive 
                                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/50' 
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                }`}
                                title={table.config.name}
                                aria-label={`Xem bảng ${table.config.name}`}
                            >
                                {icon}
                            </button>
                        );
                    })}
                </div>

                <div className="flex-grow overflow-y-auto custom-scrollbar bg-slate-900/50 flex flex-col">
                    {activeTable ? (
                        <div className="p-4 space-y-4">
                            <div className="flex justify-between items-end border-b border-slate-700/50 pb-2">
                                <h3 className="text-lg font-bold text-white">{activeTable.config.name}</h3>
                            </div>
                            
                            {activeTable.config.description && (
                                <p className="text-xs text-slate-400 italic bg-slate-800/30 p-2 rounded border border-slate-700/30">
                                    {activeTable.config.description}
                                </p>
                            )}

                            <TableView table={activeTable} />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-500 italic">
                            Chọn bảng để xem dữ liệu
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
