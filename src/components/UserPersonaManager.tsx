
import React, { useState, useCallback, useId } from 'react';
import { useUserPersona } from '../contexts/UserPersonaContext';
import type { UserPersona } from '../types';
import { Loader } from './Loader';

const PersonaEditor: React.FC<{ persona: UserPersona; onUpdate: (persona: UserPersona) => void }> = ({ persona, onUpdate }) => {
    const nameId = useId();
    const descriptionId = useId();

    return (
        <div className="bg-slate-800/50 p-6 rounded-xl space-y-4 h-full flex flex-col">
            <h3 className="text-xl font-bold text-sky-400">Chỉnh sửa Hồ sơ</h3>
            <div>
                <label htmlFor={nameId} className="block text-sm font-medium text-slate-300 mb-1">Tên Hồ sơ</label>
                <input
                    id={nameId}
                    type="text"
                    value={persona.name}
                    onChange={(e) => onUpdate({ ...persona, name: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500"
                />
            </div>
            <div className="flex-grow flex flex-col">
                <label htmlFor={descriptionId} className="block text-sm font-medium text-slate-300 mb-1">Mô tả</label>
                <textarea
                    id={descriptionId}
                    value={persona.description}
                    onChange={(e) => onUpdate({ ...persona, description: e.target.value })}
                    rows={10}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 flex-grow"
                    placeholder="Mô tả về con người, tính cách, hoặc vai trò bạn muốn nhập vai..."
                />
            </div>
        </div>
    );
};

export const UserPersonaManager: React.FC = () => {
    const {
        personas,
        activePersonaId,
        isLoading,
        error,
        addOrUpdatePersona,
        deletePersona,
        setActivePersonaId,
    } = useUserPersona();

    const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

    const handleCreateNew = () => {
        const newPersona: UserPersona = {
            id: `persona_${Date.now()}`,
            name: 'Hồ sơ Mới',
            description: '',
        };
        addOrUpdatePersona(newPersona);
        setSelectedPersonaId(newPersona.id);
    };

    const handleDelete = () => {
        if (selectedPersonaId && window.confirm('Bạn có chắc chắn muốn xóa hồ sơ này không?')) {
            deletePersona(selectedPersonaId);
            setSelectedPersonaId(null);
        }
    };

    const handleToggleActive = (personaId: string) => {
        if (activePersonaId === personaId) {
            setActivePersonaId(null); // Tắt nếu đang được bật
        } else {
            setActivePersonaId(personaId); // Bật
        }
    };
    
    const selectedPersona = personas.find(p => p.id === selectedPersonaId) || null;

    if (isLoading) {
        return <Loader message="Đang tải hồ sơ..." />;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1 bg-slate-800/50 p-4 rounded-xl flex flex-col gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-200 mb-4">Hồ sơ Người dùng (Persona)</h3>
                    <div className="space-y-2">
                        {personas.length === 0 ? (
                             <p className="text-slate-500 text-sm italic text-center py-4">Chưa có hồ sơ nào.</p>
                        ) : (
                            personas.map(persona => (
                                <div key={persona.id} className={`p-3 rounded-lg transition-colors text-sm font-medium ${selectedPersonaId === persona.id ? 'bg-sky-600/30 ring-2 ring-sky-500' : 'bg-slate-700/50'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="truncate flex-grow mr-4">{persona.name}</span>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            <button onClick={() => setSelectedPersonaId(persona.id)} aria-label={`Chỉnh sửa hồ sơ ${persona.name}`} className="text-slate-400 hover:text-sky-300">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleToggleActive(persona.id)}
                                                className={`${activePersonaId === persona.id ? 'bg-sky-500' : 'bg-slate-600'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500`}
                                                role="switch"
                                                aria-checked={activePersonaId === persona.id}
                                                aria-label={activePersonaId === persona.id ? `Tắt hồ sơ ${persona.name}` : `Kích hoạt hồ sơ ${persona.name}`}
                                            >
                                                <span className={`${activePersonaId === persona.id ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                 <div className="mt-auto space-y-2">
                    {error && <p className="text-red-400 text-xs p-2 bg-red-900/30 rounded">{error}</p>}
                    <button onClick={handleCreateNew} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg">
                        Tạo Hồ sơ Mới
                    </button>
                     <button onClick={handleDelete} disabled={!selectedPersonaId} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 text-sm rounded-lg disabled:bg-slate-600 disabled:cursor-not-allowed">
                        Xóa Hồ sơ Đã chọn
                    </button>
                </div>
            </div>

            <div className="md:col-span-2">
                {selectedPersona ? (
                    <PersonaEditor persona={selectedPersona} onUpdate={addOrUpdatePersona} />
                ) : (
                    <div className="flex items-center justify-center h-full bg-slate-800/30 rounded-xl border-2 border-dashed border-slate-700 min-h-[40vh]">
                        <div className="text-center text-slate-500">
                            <p className="font-semibold">Chọn một hồ sơ để chỉnh sửa</p>
                            <p className="text-sm mt-1">Hoặc tạo một hồ sơ mới.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
