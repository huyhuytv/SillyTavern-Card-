
import React, { useState, useMemo } from 'react';
import type { RPGDatabase, RPGTable } from '../../types/rpg';
import { useChatStore } from '../../store/chatStore';
import { useCharacter } from '../../contexts/CharacterContext'; // Need to fetch source card
import { useToast } from '../ToastSystem';
import { RpgRow } from './RpgTableComponents';

interface RpgDashboardProps {
    data: RPGDatabase | undefined;
    isOpen: boolean;
    onClose: () => void;
}

// --- TABLE VIEW COMPONENT (Interactive) ---

const InteractiveTableView: React.FC<{ table: RPGTable }> = ({ table }) => {
    const { config, data } = table;
    const { updateRpgCell, addRpgRow, deleteRpgRow } = useChatStore();

    if (!data.rows) return null;

    return (
        <div className="flex flex-col h-full">
            <div className="overflow-x-auto custom-scrollbar flex-grow border border-slate-700 rounded-t-lg bg-slate-900/30">
                <table className="w-full text-left border-collapse min-w-max">
                    <thead className="sticky top-0 z-20 bg-slate-900 shadow-sm">
                        <tr>
                            <th className="w-10 text-center py-3 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-700 bg-slate-900">#</th>
                            {config.columns.map(col => (
                                <th key={col.id} className="p-3 text-xs font-bold text-slate-300 uppercase border-b border-slate-700 border-r border-slate-800 last:border-r-0 min-w-[120px]">
                                    <div className="flex items-center gap-1">
                                        {col.label}
                                        {col.type === 'boolean' && <span className="text-[9px] text-slate-500">(Bool)</span>}
                                        {col.type === 'number' && <span className="text-[9px] text-slate-500">(Num)</span>}
                                    </div>
                                </th>
                            ))}
                            <th className="w-10 border-b border-slate-700"></th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {data.rows.length === 0 ? (
                            <tr>
                                <td colSpan={config.columns.length + 2} className="text-center py-8 text-slate-500 italic">
                                    Bảng trống. Nhấn "Thêm dòng mới" để bắt đầu.
                                </td>
                            </tr>
                        ) : (
                            data.rows.map((row, rowIdx) => (
                                <RpgRow
                                    key={row[0]} // UUID
                                    row={row}
                                    columns={config.columns}
                                    rowIndex={rowIdx}
                                    onCellUpdate={(r, c, v) => updateRpgCell(config.id, r, c, v)}
                                    onDelete={(r) => deleteRpgRow(config.id, r)}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            {/* Footer Action Bar */}
            <div className="border-t border-slate-700 p-2 bg-slate-800 rounded-b-lg flex justify-between items-center">
                <div className="text-xs text-slate-500">
                    {data.rows.length} dòng dữ liệu
                </div>
                <button
                    onClick={() => addRpgRow(config.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded shadow-sm transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Thêm Dòng Mới
                </button>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

export const RpgDashboard: React.FC<RpgDashboardProps> = ({ data, isOpen, onClose }) => {
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    
    // Store Actions
    const { reloadRpgConfig, card } = useChatStore();
    const { characters } = useCharacter();
    const { showToast } = useToast();

    useMemo(() => {
        if (isOpen && !activeTabId && data?.tables?.length) {
            setActiveTabId(data.tables[0].config.id);
        }
    }, [isOpen, data]);

    const handleReloadConfig = () => {
        if (!card) return;
        
        // Find the source character from the global context using fileName
        const sourceChar = characters.find(c => c.fileName === card.fileName);
        
        if (!sourceChar || !sourceChar.card.rpg_data) {
            showToast("Không tìm thấy dữ liệu RPG gốc trong Thẻ nhân vật.", "error");
            return;
        }

        // Execute Reload
        reloadRpgConfig(sourceChar.card.rpg_data);
        showToast("Đã đồng bộ cấu hình từ thẻ gốc thành công!", "success");
    };

    if (!isOpen || !data) return null;

    const activeTable = data.tables ? data.tables.find(t => t.config.id === activeTabId) : undefined;

    return (
        <div className="fixed inset-y-0 right-0 z-[100] w-[800px] max-w-full bg-slate-900/95 backdrop-blur-xl border-l border-slate-700 shadow-2xl flex flex-col transform transition-transform animate-slide-in-right">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <div>
                    <h2 className="text-xl font-bold text-sky-400 flex items-center gap-2">
                        <span>⚔️</span> Mythic Dashboard (V2)
                    </h2>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                        Live Editor • Update: {data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : 'N/A'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* NEW RELOAD BUTTON */}
                    <button
                        onClick={handleReloadConfig}
                        className="px-3 py-1.5 text-xs font-bold bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white border border-amber-500/30 rounded transition-colors flex items-center gap-1"
                        title="Nạp lại cấu hình (Cột, Luật, Live-Link) từ Thẻ gốc nhưng giữ nguyên Dữ liệu chơi."
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                        Đồng bộ Cấu hình gốc
                    </button>

                    <button 
                        onClick={onClose} 
                        className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
                        aria-label="Đóng bảng điều khiển RPG"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            <div className="flex-grow flex overflow-hidden">
                {/* Sidebar Tables */}
                <div className="w-48 bg-slate-950 border-r border-slate-800 flex flex-col py-2 shrink-0 overflow-y-auto custom-scrollbar">
                    {data.tables && data.tables.map(table => {
                        const isActive = table.config.id === activeTabId;
                        return (
                            <button
                                key={table.config.id}
                                onClick={() => setActiveTabId(table.config.id)}
                                className={`px-4 py-3 text-left text-sm font-medium transition-colors border-l-4 ${
                                    isActive 
                                    ? 'bg-slate-800 text-sky-400 border-sky-500' 
                                    : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                                }`}
                            >
                                <div className="truncate">{table.config.name}</div>
                                <div className="text-[10px] text-slate-600 font-normal mt-0.5">{table.data.rows.length} records</div>
                            </button>
                        );
                    })}
                </div>

                {/* Main Content */}
                <div className="flex-grow overflow-hidden bg-slate-900/50 flex flex-col relative">
                    {activeTable ? (
                        <div className="flex flex-col h-full p-4 gap-4">
                            <div className="flex justify-between items-end border-b border-slate-700/50 pb-2 shrink-0">
                                <div>
                                    <h3 className="text-lg font-bold text-white">{activeTable.config.name}</h3>
                                    <p className="text-xs text-slate-400 italic max-w-lg truncate">{activeTable.config.description || 'Không có mô tả'}</p>
                                </div>
                            </div>
                            
                            <div className="flex-grow overflow-hidden">
                                <InteractiveTableView table={activeTable} />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-500 italic flex-col gap-2">
                            <span className="text-4xl">🗂️</span>
                            <span>Chọn bảng dữ liệu để chỉnh sửa</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
