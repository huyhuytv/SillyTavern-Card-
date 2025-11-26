
import React, { useState, useCallback, useId } from 'react';
import type { TavernHelperScript } from '../types';

const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 bg-slate-500/50 hover:bg-slate-400/70 rounded-md text-slate-300 hover:text-white transition-colors"
            title={copied ? "Đã sao chép!" : "Sao chép"}
            aria-label="Sao chép nội dung kịch bản"
        >
            {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
        </button>
    );
};


const ToggleInput: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; "aria-label"?: string; }> = ({ label, checked, onChange, "aria-label": ariaLabel }) => (
    <div className="flex items-center">
        {label && <label className="text-sm font-medium text-slate-300 mr-3">{label}</label>}
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`${
                checked ? 'bg-sky-500' : 'bg-slate-600'
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900`}
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
        >
            <span
                aria-hidden="true"
                className={`${
                    checked ? 'translate-x-5' : 'translate-x-0'
                } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
        </button>
    </div>
);

interface TavernScriptItemProps {
    script: TavernHelperScript;
    index: number;
    onUpdate: (index: number, updatedScript: TavernHelperScript) => void;
    onRemove: (index: number) => void;
}

const TavernScriptItem: React.FC<TavernScriptItemProps> = ({ script, index, onUpdate, onRemove }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const nameInputId = useId();
    const contentInputId = useId();

    const handleChange = (field: keyof TavernHelperScript['value'], value: any) => {
        onUpdate(index, { 
            ...script, 
            value: {
                ...script.value,
                [field]: value 
            }
        });
    };

    return (
        <div className="bg-slate-800 rounded-lg border border-slate-700">
            <div className="flex items-center p-3">
                <div className="flex items-center gap-2 flex-shrink-0 mr-4" onClick={(e) => e.stopPropagation()}>
                    <ToggleInput label="" checked={script.value.enabled} onChange={v => handleChange('enabled', v)} aria-label={`Bật/tắt kịch bản ${script.value.name || 'không tên'}`} />
                </div>
                <div className="flex-grow cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                    <span className={`font-medium truncate ${script.value.enabled ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                        {script.value.name || 'Kịch bản không tên'}
                    </span>
                </div>
                <div className="flex items-center ml-4 flex-shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                        aria-label={`Xóa kịch bản "${script.value.name}"`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                    </button>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 text-slate-400" aria-label={isExpanded ? "Thu gọn" : "Mở rộng"}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className="p-4 border-t border-slate-700/50 space-y-4">
                    <label htmlFor={nameInputId} className="block text-sm font-medium text-slate-300 mb-1">Tên Kịch bản</label>
                    <input id={nameInputId} type="text" value={script.value.name} onChange={e => handleChange('name', e.target.value)} className="w-full bg-slate-600 border border-slate-500 rounded-md p-2 text-slate-200" />
                    
                    <div className="relative">
                        <label htmlFor={contentInputId} className="block text-sm font-medium text-slate-300 mb-1">Nội dung</label>
                        <textarea id={contentInputId} value={script.value.content} onChange={e => handleChange('content', e.target.value)} rows={15} className="w-full bg-slate-600 border border-slate-500 rounded-md p-2 pr-10 text-slate-200 font-mono text-xs" />
                        <CopyButton textToCopy={script.value.content} />
                    </div>
                </div>
            )}
        </div>
    );
};

interface TavernScriptsEditorProps {
    scripts: TavernHelperScript[];
    onUpdate: (scripts: TavernHelperScript[]) => void;
}

export const TavernScriptsEditor: React.FC<TavernScriptsEditorProps> = ({ scripts = [], onUpdate }) => {

    const handleUpdateScript = useCallback((index: number, updatedScript: TavernHelperScript) => {
        const newScripts = [...scripts];
        newScripts[index] = updatedScript;
        onUpdate(newScripts);
    }, [scripts, onUpdate]);

    const handleRemoveScript = useCallback((index: number) => {
        const newScripts = scripts.filter((_, i) => i !== index);
        onUpdate(newScripts);
    }, [scripts, onUpdate]);

    const handleAddScript = useCallback(() => {
        const newScript: TavernHelperScript = {
            type: 'script',
            value: {
                id: `tavern_${Date.now()}`,
                name: 'Kịch bản Mới',
                content: '',
                enabled: true
            }
        };
        onUpdate([...scripts, newScript]);
    }, [scripts, onUpdate]);

    return (
        <div className="space-y-3">
            {scripts.map((script, index) => (
                <TavernScriptItem
                    key={script.value.id || index}
                    script={script}
                    index={index}
                    onUpdate={handleUpdateScript}
                    onRemove={handleRemoveScript}
                />
            ))}
             <button
                onClick={handleAddScript}
                className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-sky-400 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 border border-slate-600"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                </svg>
                <span>Thêm Kịch bản Tavern Helper</span>
            </button>
        </div>
    );
};
