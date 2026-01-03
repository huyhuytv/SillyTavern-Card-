
import React, { useCallback, useState, useEffect, useMemo, useId, useRef } from 'react';
import type { CharacterCard, WorldInfoEntry, RegexScript, TavernHelperScript } from '../types';
import { useLorebook } from '../contexts/LorebookContext';
import { RegexScriptsEditor } from './RegexScriptsEditor';
import { TavernScriptsEditor } from './TavernScriptsEditor';
import { translateGreetingsBatch } from '../services/geminiService';
import { getActiveModel } from '../services/settingsService';
import { useToast } from './ToastSystem';
import { Loader } from './Loader';


const Section: React.FC<{title: string; description: string; children: React.ReactNode}> = ({title, description, children}) => (
    <details className="bg-slate-800/50 rounded-xl shadow-lg open:mb-6 transition-all duration-300" open>
        <summary className="p-6 cursor-pointer text-xl font-bold text-sky-400 list-none flex justify-between items-center">
            <div>
                <h3 className="text-xl font-bold text-sky-400">{title}</h3>
                <p className="text-sm text-slate-400 font-normal mt-1">{description}</p>
            </div>
            <svg className="w-6 h-6 text-slate-400 transform transition-transform duration-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
        </summary>
        <div className="p-6 pt-0 space-y-4">{children}</div>
    </details>
);


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
            className="absolute top-2 right-2 p-1.5 bg-slate-600/50 hover:bg-slate-500/70 rounded-md text-slate-400 hover:text-white transition-colors"
            aria-label="Sao chép toàn bộ nội dung"
            title={copied ? "Đã sao chép!" : "Sao chép toàn bộ nội dung"}
        >
            {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
        </button>
    );
};


const LabeledInput: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string }> = ({ label, value, onChange, type = "text" }) => {
    const id = useId();
    return (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <div className="relative">
            <input
                id={id}
                type={type}
                value={value}
                onChange={onChange}
                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
            />
        </div>
    </div>
)};

const LabeledTextarea: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number, className?: string; containerClassName?: string }> = ({ label, value, onChange, rows=3, className='', containerClassName='' }) => {
    const id = useId();
    return (
    <div className={containerClassName}>
        <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <div className="relative">
            <textarea
                id={id}
                value={value}
                onChange={onChange}
                rows={rows}
                className={`w-full bg-slate-700 border border-slate-600 rounded-md p-2 pr-10 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition ${className}`}
            />
            <CopyButton textToCopy={value} />
        </div>
    </div>
)};

const ToggleInput: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; }> = ({ label, checked, onChange }) => {
    const id = useId();
    return (
    <div className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg">
        <label id={id} className="text-sm font-medium text-slate-300">{label}</label>
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`${
                checked ? 'bg-sky-500' : 'bg-slate-600'
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800`}
            role="switch"
            aria-checked={checked}
            aria-labelledby={id}
        >
            <span
                aria-hidden="true"
                className={`${
                    checked ? 'translate-x-5' : 'translate-x-0'
                } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
        </button>
    </div>
)};


const GreetingsEditor: React.FC<{ card: CharacterCard; onUpdate: (card: CharacterCard) => void; }> = ({ card, onUpdate }) => {
    // Combine first_mes and alternate_greetings into a single array for easier management
    const allGreetings = useMemo(() => [card.first_mes, ...(card.alternate_greetings || [])], [card.first_mes, card.alternate_greetings]);
    const firstGreetingId = useId();
    const [isTranslating, setIsTranslating] = useState(false);
    const { showToast } = useToast();

    const handleGreetingChange = (index: number, value: string) => {
        const newGreetings = [...allGreetings];
        newGreetings[index] = value;

        // Deconstruct back into first_mes and alternate_greetings
        const [newFirstMes, ...newAlternates] = newGreetings;
        onUpdate({
            ...card,
            first_mes: newFirstMes,
            alternate_greetings: newAlternates.length > 0 ? newAlternates : [],
        });
    };

    const addGreeting = () => {
        const newGreetings = [...allGreetings, ''];
        const [newFirstMes, ...newAlternates] = newGreetings;
        onUpdate({
            ...card,
            first_mes: newFirstMes,
            alternate_greetings: newAlternates,
        });
    };

    const removeGreeting = (index: number) => {
        if (allGreetings.length <= 1) return; // Can't remove the last greeting
        const newGreetings = allGreetings.filter((_, i) => i !== index);
        const [newFirstMes, ...newAlternates] = newGreetings;
        onUpdate({
            ...card,
            first_mes: newFirstMes,
            alternate_greetings: newAlternates.length > 0 ? newAlternates : [],
        });
    };
    
    const setAsPrimary = (index: number) => {
        if (index === 0) return;
        const newGreetings = [...allGreetings];
        const itemToMove = newGreetings.splice(index, 1)[0];
        newGreetings.unshift(itemToMove);
        
        const [newFirstMes, ...newAlternates] = newGreetings;
        onUpdate({
            ...card,
            first_mes: newFirstMes,
            alternate_greetings: newAlternates,
        });
    };

    const handleTranslate = async () => {
        if (!confirm("Hành động này sẽ dịch toàn bộ lời chào và ghi đè nội dung hiện tại bằng kết quả từ AI. Bạn có chắc chắn không?")) return;

        setIsTranslating(true);
        try {
            const payload = {
                first_mes: card.first_mes,
                alternate_greetings: card.alternate_greetings || [],
                group_only_greetings: card.group_only_greetings || []
            };

            const context = {
                name: card.name,
                description: card.description
            };

            const model = getActiveModel();
            const translatedData = await translateGreetingsBatch(payload, context, model);

            onUpdate({
                ...card,
                first_mes: translatedData.first_mes,
                alternate_greetings: translatedData.alternate_greetings,
                group_only_greetings: translatedData.group_only_greetings
            });

            showToast("Đã dịch xong toàn bộ lời chào!", "success");

        } catch (error) {
            console.error(error);
            showToast(`Lỗi dịch thuật: ${error instanceof Error ? error.message : String(error)}`, "error");
        } finally {
            setIsTranslating(false);
        }
    };

    return (
        <div className="space-y-4 col-span-full">
            <div className="flex justify-end">
                <button
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg shadow-md transition-colors flex items-center gap-2 disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                    {isTranslating ? <Loader message="Đang dịch..." /> : (
                        <>
                            <span>✨</span> Dịch toàn bộ Lời chào (AI)
                        </>
                    )}
                </button>
            </div>

            {allGreetings.map((greeting, index) => (
                <div key={index} className={`bg-slate-700/50 p-4 rounded-lg ${isTranslating ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex justify-between items-center mb-2">
                        <label htmlFor={`${firstGreetingId}-${index}`} className="text-sm font-bold text-slate-300">
                            {index === 0 ? 'Lời chào Chính (first_mes)' : `Lời chào Thay thế #${index}`}
                        </label>
                        <div className="flex items-center gap-2">
                            {index > 0 && (
                                <button
                                    onClick={() => setAsPrimary(index)}
                                    className="text-xs bg-sky-700 hover:bg-sky-600 text-white font-semibold py-1 px-2 rounded-md transition-colors"
                                    title="Đặt làm lời chào chính"
                                >
                                    Đặt làm Chính
                                </button>
                            )}
                            {allGreetings.length > 1 && (
                                <button
                                    onClick={() => removeGreeting(index)}
                                    className="text-slate-400 hover:text-red-400"
                                    aria-label={`Xóa lời chào #${index + 1}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="relative">
                        <textarea
                            id={`${firstGreetingId}-${index}`}
                            value={greeting}
                            onChange={(e) => handleGreetingChange(index, e.target.value)}
                            rows={8}
                            disabled={isTranslating}
                            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 pr-10 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition disabled:bg-slate-800 disabled:text-slate-500"
                        />
                        <CopyButton textToCopy={greeting} />
                    </div>
                </div>
            ))}
            <button
                onClick={addGreeting}
                disabled={isTranslating}
                className="w-full bg-slate-700 hover:bg-slate-600 text-sky-400 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 border border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                Thêm Lời chào
            </button>
        </div>
    );
};

const GroupGreetingsEditor: React.FC<{ greetings: string[]; onUpdate: (greetings: string[]) => void; }> = ({ greetings, onUpdate }) => {
    const firstGreetingId = useId();
    const handleChange = (index: number, value: string) => {
        const newGreetings = [...greetings];
        newGreetings[index] = value;
        onUpdate(newGreetings);
    };

    const addGreeting = () => {
        onUpdate([...greetings, '']);
    };

    const removeGreeting = (index: number) => {
        onUpdate(greetings.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4 col-span-full">
            <h4 className="text-lg font-semibold text-slate-300">Lời chào Chỉ dành cho Nhóm</h4>
            {greetings.map((greeting, index) => (
                <div key={index} className="bg-slate-700/50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                        <label htmlFor={`${firstGreetingId}-${index}`} className="text-sm font-bold text-slate-300">
                           Lời chào Nhóm #{index + 1}
                        </label>
                        <button
                            onClick={() => removeGreeting(index)}
                            className="text-slate-400 hover:text-red-400"
                            aria-label={`Xóa lời chào nhóm #${index + 1}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                    <div className="relative">
                        <textarea
                            id={`${firstGreetingId}-${index}`}
                            value={greeting}
                            onChange={(e) => handleChange(index, e.target.value)}
                            rows={4}
                            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 pr-10 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        />
                        <CopyButton textToCopy={greeting} />
                    </div>
                </div>
            ))}
             <button
                onClick={addGreeting}
                className="w-full bg-slate-700 hover:bg-slate-600 text-sky-400 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 border border-slate-600"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                Thêm Lời chào Nhóm
            </button>
        </div>
    )
};


interface CharacterEditorProps {
  card: CharacterCard;
  onUpdate: (card: CharacterCard) => void;
  onOpenLorebook: () => void; // Hook to notify parent to switch view
}

export const CharacterEditor: React.FC<CharacterEditorProps> = ({ card, onUpdate, onOpenLorebook }) => {
  const { lorebooks } = useLorebook();
  const [extensionsJson, setExtensionsJson] = useState('{}');
  const [isExtensionsJsonValid, setIsExtensionsJsonValid] = useState(true);
  const [selectedLorebook, setSelectedLorebook] = useState<string>('');
  
  const tagsInputId = useId();
  const lorebookSelectId = useId();
  
  // State for dynamically rendered JSON fields
  const [dynamicJsonFields, setDynamicJsonFields] = useState<Record<string, { value: string; isValid: boolean }>>({});

  const unhandledExtensions = { ...card.extensions };
  delete unhandledExtensions.regex_scripts;
  delete unhandledExtensions.TavernHelper_scripts;

  // Define a set of keys that are already handled by dedicated UI components
  const handledKeys = new Set([
      'name', 'description', 'personality', 'char_persona',
      'first_mes', 'mes_example',
      'scenario', 'system_prompt', 'post_history_instructions',
      'creator', 'character_version', 'tags',
      'creator_notes', 'creatorcomment',
      'char_book', 'character_book', 
      'attached_lorebooks',
      'alternate_greetings',
      'group_only_greetings',
      'extensions', 'data', 
      'spec', 'spec_version', 
      'create_date', 'avatar', 
  ]);

  const dynamicFields = Object.keys(card).filter(key => !handledKeys.has(key));
  
  useEffect(() => {
    const initialJsonFields: Record<string, { value: string; isValid: boolean }> = {};
    dynamicFields.forEach(key => {
        const value = card[key as keyof CharacterCard];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            initialJsonFields[key] = {
                value: JSON.stringify(value, null, 2),
                isValid: true
            };
        }
    });
    setDynamicJsonFields(initialJsonFields);
  }, [card, dynamicFields.join(',')]);


  useEffect(() => {
    const jsonString = JSON.stringify(unhandledExtensions, null, 2);
    setExtensionsJson(jsonString === 'null' ? '{}' : jsonString);
    setIsExtensionsJsonValid(true);
  }, [card.extensions]);
  
  const handleChange = useCallback((field: keyof CharacterCard, value: string | number) => {
    onUpdate({ ...card, [field]: value });
  }, [card, onUpdate]);

  const handleTagsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
    onUpdate({ ...card, tags });
  }, [card, onUpdate]);

  const handleExtensionsChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setExtensionsJson(newValue);
      try {
        const parsed = newValue.trim() === '' ? {} : JSON.parse(newValue);
        onUpdate({ 
            ...card, 
            extensions: {
                ...card.extensions,
                ...parsed,
            } 
        });
        setIsExtensionsJsonValid(true);
      } catch (error) {
        setIsExtensionsJsonValid(false);
      }
  }, [card, onUpdate]);
  
  const handleDynamicFieldChange = useCallback((key: string, value: any) => {
    onUpdate({ ...card, [key]: value });
  }, [card, onUpdate]);
  
  const handleDynamicJsonFieldChange = useCallback((key: string, stringValue: string) => {
    setDynamicJsonFields(prev => ({ ...prev, [key]: { ...prev[key], value: stringValue } }));
    try {
      const parsed = stringValue.trim() === '' ? null : JSON.parse(stringValue);
      setDynamicJsonFields(prev => ({ ...prev, [key]: { value: stringValue, isValid: true } }));
      onUpdate({ ...card, [key]: parsed });
    } catch {
      setDynamicJsonFields(prev => ({ ...prev, [key]: { value: stringValue, isValid: false } }));
    }
  }, [card, onUpdate]);

  const handleImportLorebook = useCallback(() => {
    if (!selectedLorebook) return;
    const lorebookToImport = lorebooks.find(lb => lb.name === selectedLorebook);
    if (!lorebookToImport || !lorebookToImport.book) return;

    const sourceEntries = lorebookToImport.book.entries || [];
    const entryCount = sourceEntries.length;
    
    if (entryCount === 0) {
      alert('Sổ tay này không có mục nào để nhập.');
      return;
    }

    // REMOVED CONFIRMATION DIALOG AS REQUESTED

    const newEntries = JSON.parse(JSON.stringify(sourceEntries)) as WorldInfoEntry[];

    newEntries.forEach(entry => {
      entry.source_lorebook = lorebookToImport.name;
      entry.uid = `imported_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      if (entry.enabled === undefined) {
          entry.enabled = true;
      }
    });

    const currentEntries = card.char_book?.entries || [];
    const combinedEntries = [...currentEntries, ...newEntries];
    
    const newCard = { 
        ...card,
        char_book: {
            ...(card.char_book || { entries: [] }),
            entries: combinedEntries,
        }
    };

    onUpdate(newCard);
    setSelectedLorebook('');
    alert(`Đã nhập thành công ${entryCount} mục! Kiểm tra phần 'Sổ tay Nhân vật' ở trên.`);
  }, [card, onUpdate, selectedLorebook, lorebooks]);
  
  const handleRegexScriptsUpdate = useCallback((updatedScripts: RegexScript[]) => {
    const newExtensions = { ...(card.extensions || {}) };
    if (updatedScripts && updatedScripts.length > 0) {
        newExtensions.regex_scripts = updatedScripts;
    } else {
        delete newExtensions.regex_scripts;
    }
    onUpdate({ ...card, extensions: newExtensions });
  }, [card, onUpdate]);

  const handleTavernScriptsUpdate = useCallback((updatedScripts: TavernHelperScript[]) => {
    const newExtensions = { ...(card.extensions || {}) };
    if (updatedScripts && updatedScripts.length > 0) {
        newExtensions.TavernHelper_scripts = updatedScripts;
    } else {
        delete newExtensions.TavernHelper_scripts;
    }
    onUpdate({ ...card, extensions: newExtensions });
  }, [card, onUpdate]);

  const availableLorebooksToImport = lorebooks;
  
  const entries = card.char_book?.entries || [];
  const enabledEntries = entries.filter(e => e.enabled !== false).length;

  return (
    <div className="space-y-4">
      <Section title="Thông tin cốt lõi" description="Định nghĩa cơ bản về nhân vật của bạn.">
          <LabeledInput label="Tên" value={card.name} onChange={(e) => handleChange('name', e.target.value)} />
          <LabeledTextarea containerClassName="col-span-full" label="Mô tả" value={card.description} onChange={(e) => handleChange('description', e.target.value)} rows={5} />
          <LabeledTextarea containerClassName="col-span-full" label="Tính cách" value={card.personality || ''} onChange={(e) => handleChange('personality', e.target.value)} rows={5} />
          <LabeledTextarea containerClassName="col-span-full" label="Vai trò (Persona)" value={card.char_persona || ''} onChange={(e) => handleChange('char_persona', e.target.value)} rows={5} />
      </Section>

      <Section title="Đối thoại" description="Lời chào đầu tiên và các ví dụ hội thoại.">
        <GreetingsEditor card={card} onUpdate={onUpdate} />

        <div className="col-span-full border-t border-slate-700 my-2"></div>

        <GroupGreetingsEditor 
            greetings={card.group_only_greetings || []}
            onUpdate={(newGreetings) => onUpdate({ ...card, group_only_greetings: newGreetings })}
        />

        <div className="col-span-full border-t border-slate-700 my-2"></div>
        
        <LabeledTextarea containerClassName="col-span-full" label="Ví dụ hội thoại (Phân tách bằng <START>)" value={card.mes_example} onChange={(e) => handleChange('mes_example', e.target.value)} rows={8} />
      </Section>
      
      <Section title="Kịch bản & Lời nhắc" description="Bối cảnh, gợi ý hệ thống và các chỉ dẫn khác.">
         <LabeledTextarea containerClassName="col-span-full" label="Kịch bản" value={card.scenario || ''} onChange={(e) => handleChange('scenario', e.target.value)} />
         <LabeledTextarea containerClassName="col-span-full" label="Gợi ý hệ thống" value={card.system_prompt || ''} onChange={(e) => handleChange('system_prompt', e.target.value)} />
         <LabeledTextarea containerClassName="col-span-full" label="Chỉ dẫn sau lịch sử" value={card.post_history_instructions || ''} onChange={(e) => handleChange('post_history_instructions', e.target.value)} />
      </Section>

      <Section title="Siêu dữ liệu & Ghi chú" description="Thông tin bổ sung về thẻ nhân vật này.">
        <LabeledInput label="Người tạo" value={card.creator || ''} onChange={(e) => handleChange('creator', e.target.value)} />
        <LabeledInput label="Phiên bản nhân vật" value={card.character_version || ''} onChange={(e) => handleChange('character_version', e.target.value)} />
        <div className="col-span-full">
            <label htmlFor={tagsInputId} className="block text-sm font-medium text-slate-300 mb-1">Thẻ (phân tách bằng dấu phẩy)</label>
            <div className="relative">
                <input
                    id={tagsInputId}
                    type="text"
                    value={card.tags?.join(', ') || ''}
                    onChange={handleTagsChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                    placeholder="fantasy, sci-fi, isekai"
                />
            </div>
        </div>
        <LabeledTextarea containerClassName="col-span-full" label="Ghi chú của người tạo" value={card.creator_notes || ''} onChange={(e) => handleChange('creator_notes', e.target.value)} />
        <LabeledTextarea containerClassName="col-span-full" label="Nhận xét của người tạo (V3)" value={card.creatorcomment || ''} onChange={(e) => handleChange('creatorcomment', e.target.value)} />
      </Section>
      
      {dynamicFields.length > 0 && (
          <Section title="Trường Dữ liệu Thẻ Khác" description="Các trường được phát hiện tự động từ thẻ nhân vật.">
              <div className="grid grid-cols-1 gap-4">
              {dynamicFields.map(key => {
                  const value = card[key as keyof CharacterCard] as any;
                  
                  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
                      return (
                          <LabeledTextarea
                              key={key}
                              containerClassName="col-span-full"
                              label={`${key} (Mỗi mục phân tách bằng '---')`}
                              value={value.join('\n---\n')}
                              onChange={(e) => handleDynamicFieldChange(key, e.target.value.split('\n---\n').map(g => g.trim()))}
                              rows={5}
                          />
                      );
                  }

                  if (typeof value === 'string') {
                      return (
                          <LabeledTextarea
                              key={key}
                              containerClassName="col-span-full"
                              label={key}
                              value={value}
                              onChange={(e) => handleDynamicFieldChange(key, e.target.value)}
                          />
                      );
                  }
                  
                  if (typeof value === 'boolean') {
                      return (
                           <div key={key}>
                                <ToggleInput label={key} checked={value} onChange={v => handleDynamicFieldChange(key, v)} />
                           </div>
                      );
                  }
                  
                  if (typeof value === 'number') {
                      return (
                          <LabeledInput
                              key={key}
                              label={key}
                              type="number"
                              value={String(value)}
                              onChange={(e) => handleDynamicFieldChange(key, parseFloat(e.target.value) || 0)}
                          />
                      );
                  }
                  
                  if (typeof value === 'object' && value !== null) {
                      const fieldState = dynamicJsonFields[key] || { value: '', isValid: true };
                      return (
                          <div key={key} className="col-span-full">
                            <LabeledTextarea 
                                label={`Đối tượng JSON: ${key}`}
                                value={fieldState.value} 
                                onChange={(e) => handleDynamicJsonFieldChange(key, e.target.value)}
                                rows={8} 
                                className={`font-mono text-xs ${!fieldState.isValid ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
                            />
                            {!fieldState.isValid && <p className="text-sm text-red-400 mt-1">JSON không hợp lệ.</p>}
                          </div>
                      );
                  }

                  return null;
              })}
              </div>
          </Section>
      )}

      <Section title="Sổ tay Nhân vật (Character Book)" description="Các mục World Info được nhúng trực tiếp vào thẻ này. Mỗi mục có thể được bật/tắt riêng.">
        <div className="col-span-full bg-slate-700/30 rounded-lg p-6 border border-slate-600/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
                <h4 className="text-lg font-bold text-slate-200">Tổng quan Sổ tay</h4>
                <p className="text-sm text-slate-400 mt-1">
                    Hiện có <span className="font-mono text-sky-400 font-bold">{entries.length}</span> mục 
                    (<span className="text-green-400">{enabledEntries}</span> Bật / <span className="text-slate-500">{entries.length - enabledEntries}</span> Tắt)
                </p>
            </div>
            <button 
                onClick={onOpenLorebook}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                </svg>
                Mở Trình quản lý Sổ tay (Full Screen)
            </button>
        </div>
      </Section>

      <Section title="Nhập từ Sổ tay Thế giới" description="Sao chép các mục từ một Sổ tay Thế giới vào Sổ tay Nhân vật của thẻ này.">
        <div className="space-y-4 col-span-full">
          {availableLorebooksToImport.length > 0 ? (
            <div className="flex gap-2">
              <label htmlFor={lorebookSelectId} className="sr-only">Chọn một sổ tay để nhập</label>
              <select 
                id={lorebookSelectId}
                value={selectedLorebook}
                onChange={e => setSelectedLorebook(e.target.value)}
                className="flex-grow w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
              >
                <option value="">Chọn một sổ tay để nhập...</option>
                {availableLorebooksToImport.map(lb => <option key={lb.name} value={lb.name}>{lb.name}</option>)}
              </select>
              <button onClick={handleImportLorebook} disabled={!selectedLorebook} className="bg-sky-600 hover:bg-sky-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                Nhập mục
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">Tải lên một Sổ tay Thế giới trong tab 'Sổ tay Thế giới' để nhập các mục của nó.</p>
          )}
        </div>
      </Section>

      <Section title="Phần mở rộng (Nâng cao)" description="Quản lý các kịch bản và dữ liệu JSON thô.">
        <div className="col-span-full">
            <h4 className="text-lg font-semibold text-slate-300 mb-4">Trình chỉnh sửa Kịch bản Tavern Helper</h4>
            <TavernScriptsEditor 
              scripts={card.extensions?.TavernHelper_scripts || []}
              onUpdate={handleTavernScriptsUpdate}
            />
        </div>
        <div className="col-span-full">
            <h4 className="text-lg font-semibold text-slate-300 mb-4">Trình chỉnh sửa Kịch bản Regex</h4>
            <RegexScriptsEditor 
                scripts={card.extensions?.regex_scripts || []}
                onUpdate={handleRegexScriptsUpdate}
            />
        </div>

        <div className="col-span-full">
            <div className="border-t border-slate-700 my-6"></div>
            <h4 className="text-lg font-semibold text-slate-300 mb-4">Trình chỉnh sửa JSON thô (Các trường mở rộng còn lại)</h4>
            <LabeledTextarea 
                label="Các trường JSON chưa được xử lý trong 'extensions'"
                value={extensionsJson} 
                onChange={handleExtensionsChange} 
                rows={10} 
                className={`font-mono text-xs ${!isExtensionsJsonValid ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
            />
            {!isExtensionsJsonValid && <p className="text-sm text-red-400 mt-1">JSON không hợp lệ.</p>}
        </div>
      </Section>

    </div>
  );
};