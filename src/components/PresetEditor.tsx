
import React, { useCallback, useState, useEffect, useMemo, useRef, useId } from 'react';
import type { SillyTavernPreset } from '../types';
import { Tooltip } from './Tooltip';
import { getOpenRouterModels } from '../services/geminiService';
import type { OpenRouterModel } from '../types';
import { Loader } from './Loader';

// Section component for consistent styling
const Section: React.FC<{title: string; description: string; children: React.ReactNode}> = ({title, description, children}) => (
    <div className="bg-slate-800/50 p-6 rounded-xl shadow-lg mb-6">
        <h3 className="text-xl font-bold text-sky-400 mb-1">{title}</h3>
        <p className="text-sm text-slate-400 mb-6">{description}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">{children}</div>
    </div>
);

const CopyButton: React.FC<{ textToCopy: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; copied: boolean }> = ({ textToCopy, onClick, copied }) => {
    return (
        <button
            type="button"
            onClick={onClick}
            className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 bg-slate-600/50 hover:bg-slate-500/70 rounded-md text-slate-400 hover:text-white transition-colors"
            aria-label="Sao chép toàn bộ nội dung"
            title={copied ? "Đã sao chép!" : "Sao chép toàn bộ nội dung"}
        >
            {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
        </button>
    );
};

// Reusable Input Components
const LabeledInput: React.FC<{ label: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; tooltipText?: string; placeholder?: string }> = ({ label, value, onChange, type = 'text', tooltipText, placeholder }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if(!value) return;
        navigator.clipboard.writeText(String(value)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    
    return (
    <div>
        <Tooltip text={tooltipText}>
            <label className="block text-sm font-medium text-slate-300 mb-1 cursor-help">{label}</label>
        </Tooltip>
        <div className="relative">
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 pr-10 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
            />
            <CopyButton textToCopy={String(value)} onClick={handleCopy} copied={copied} />
        </div>
    </div>
    );
};

const LabeledSelect: React.FC<{
    label: string;
    value: number | string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    options: { value: number | string; label: string }[];
    tooltipText?: string;
}> = ({ label, value, onChange, options, tooltipText }) => (
    <div>
        <Tooltip text={tooltipText}>
            <label className="block text-sm font-medium text-slate-300 mb-1 cursor-help">{label}</label>
        </Tooltip>
        <select
            value={value}
            onChange={onChange}
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
        >
            {options.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    </div>
);


const LabeledTextarea: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number, className?: string; containerClassName?: string, tooltipText?: string }> = ({ label, value, onChange, rows=3, className='', containerClassName='md:col-span-2', tooltipText }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if(!value) return;
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
    <div className={containerClassName}>
        <Tooltip text={tooltipText}>
            <label className="block text-sm font-medium text-slate-300 mb-1 cursor-help">{label}</label>
        </Tooltip>
        <div className="relative">
            <textarea
                value={value}
                onChange={onChange}
                rows={rows}
                className={`w-full bg-slate-700 border border-slate-600 rounded-md p-2 pr-10 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition ${className}`}
            />
            <CopyButton textToCopy={value} onClick={handleCopy} copied={copied} />
        </div>
    </div>
    );
};

const SliderInput: React.FC<{
    label: string;
    value: number | string;
    onChange: (value: number | string) => void;
    min?: number;
    max?: number;
    step?: number;
    tooltipText?: string;
}> = ({ label, value, onChange, min = 0, max = 1, step = 0.01, tooltipText }) => {
    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(parseFloat(e.target.value));
    };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Allow string input (for macros) or numbers
        const val = e.target.value;
        const num = parseFloat(val);
        // If it's a valid number and not ending in a dot (user typing float), use number. 
        // Otherwise treat as string to support macros or partial typing.
        if (!isNaN(num) && !val.endsWith('.') && !val.endsWith('e')) {
             onChange(num);
        } else {
             onChange(val);
        }
    };
    
    // For the slider, value must be a number. Fallback to min if it's a string (macro).
    const sliderValue = typeof value === 'number' ? value : (parseFloat(String(value)) || min);

    return (
        <div>
            <Tooltip text={tooltipText}>
                <label className="block text-sm font-medium text-slate-300 mb-1 cursor-help">{label}</label>
            </Tooltip>
            <div className="flex items-center gap-4">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={sliderValue}
                    onChange={handleSliderChange}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
                <input
                    type="text" 
                    value={value}
                    onChange={handleInputChange}
                    className="w-24 bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 text-center focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition font-mono text-sm"
                />
            </div>
        </div>
    );
};

const ToggleInput: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; tooltipText?: string }> = ({ label, checked, onChange, tooltipText }) => (
    <div className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg">
        <Tooltip text={tooltipText}>
            <label className="text-sm font-medium text-slate-300 cursor-help">{label}</label>
        </Tooltip>
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`${
                checked ? 'bg-sky-500' : 'bg-slate-600'
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800`}
            role="switch"
            aria-checked={checked}
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

const StringArrayInput: React.FC<{ label: string, values: string[], onChange: (values: string[]) => void, tooltipText?: string }> = ({ label, values = [], onChange, tooltipText }) => {
    const [copiedStates, setCopiedStates] = useState<Record<number, boolean>>({});

    const handleCopy = (index: number, text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopiedStates(prev => ({...prev, [index]: true}));
            setTimeout(() => setCopiedStates(prev => ({...prev, [index]: false})), 2000);
        });
    };

    const handleAdd = () => onChange([...values, '']);
    const handleRemove = (index: number) => onChange(values.filter((_, i) => i !== index));
    const handleUpdate = (index: number, value: string) => {
        const newValues = [...values];
        newValues[index] = value;
        onChange(newValues);
    };

    return (
        <div className="md:col-span-2 space-y-3">
            <Tooltip text={tooltipText}>
                <label className="block text-sm font-medium text-slate-300 cursor-help">{label}</label>
            </Tooltip>
            {values.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => handleUpdate(index, e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 pr-10 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        />
                        <CopyButton textToCopy={value} onClick={() => handleCopy(index, value)} copied={!!copiedStates[index]} />
                    </div>
                     <button
                        onClick={() => handleRemove(index)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-2 bg-slate-700 rounded-md"
                        aria-label={`Remove item ${index + 1}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                    </button>
                </div>
            ))}
             <button
                onClick={handleAdd}
                className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-sky-400 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 border border-slate-600"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                <span>Thêm mục</span>
            </button>
        </div>
    );
}

const SearchableSelect: React.FC<{
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}> = ({ options, value, onChange, placeholder = "Chọn một tùy chọn...", disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    
    const wrapperRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listboxRef = useRef<HTMLUListElement>(null);
    const triggerButtonRef = useRef<HTMLButtonElement>(null);

    const comboboxId = useId();
    const listboxId = useId();

    const selectedOption = useMemo(() => options.find(option => option.value === value), [options, value]);

    const filteredOptions = useMemo(() => searchTerm
        ? options.filter(option =>
            option.label.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : options, [options, searchTerm]);

    // Reset highlight when search term or options change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [searchTerm, filteredOptions.length]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
            const optionElement = listboxRef.current.querySelector(`#option-${listboxId}-${highlightedIndex}`);
            optionElement?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightedIndex, isOpen, listboxId]);

    const handleSelect = useCallback((optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        triggerButtonRef.current?.focus();
    }, [onChange]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when opened
    useEffect(() => {
        if (isOpen) {
            setSearchTerm(''); // Clear search on open
            setHighlightedIndex(0);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                    handleSelect(filteredOptions[highlightedIndex].value);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                triggerButtonRef.current?.focus();
                break;
            case 'Tab':
                setIsOpen(false);
                break;
            default:
                break;
        }
    };
    
    return (
        <div className="relative w-full" ref={wrapperRef} onKeyDown={handleKeyDown}>
            <button
                ref={triggerButtonRef}
                type="button"
                id={comboboxId}
                role="combobox"
                aria-haspopup="listbox"
                aria-controls={listboxId}
                aria-expanded={isOpen}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-left text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition flex justify-between items-center disabled:bg-slate-800 disabled:cursor-not-allowed"
            >
                <span className={`truncate ${selectedOption ? 'text-slate-200' : 'text-slate-400'}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <svg className="w-5 h-5 text-slate-400 transform transition-transform flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
            {isOpen && (
                <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-md shadow-lg max-h-60 flex flex-col">
                    <div className="p-2 border-b border-slate-700">
                        <input
                            ref={searchInputRef}
                            type="text"
                            aria-label="Tìm kiếm mô hình"
                            aria-controls={listboxId}
                            aria-activedescendant={highlightedIndex >= 0 ? `option-${listboxId}-${highlightedIndex}` : undefined}
                            placeholder="Tìm kiếm mô hình..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-1 focus:ring-sky-500"
                        />
                    </div>
                    <ul
                        id={listboxId}
                        ref={listboxRef}
                        role="listbox"
                        aria-labelledby={comboboxId}
                        className="overflow-y-auto custom-scrollbar flex-grow"
                    >
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option, index) => (
                                <li
                                    key={option.value}
                                    id={`option-${listboxId}-${index}`}
                                    role="option"
                                    aria-selected={value === option.value}
                                    onClick={() => handleSelect(option.value)}
                                    className={`p-2 cursor-pointer hover:bg-sky-600 truncate ${highlightedIndex === index ? 'bg-sky-700' : ''}`}
                                >
                                    {option.label}
                                </li>
                            ))
                        ) : (
                            <li className="p-2 text-slate-500 text-center" role="option" aria-selected="false">Không tìm thấy mô hình.</li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};

interface PresetEditorProps {
    preset: SillyTavernPreset;
    onUpdate: (preset: SillyTavernPreset) => void;
}

export const PresetEditor: React.FC<PresetEditorProps> = ({ preset, onUpdate }) => {
    const [extensionsJson, setExtensionsJson] = useState(JSON.stringify(preset.extensions, null, 2) || '{}');
    const [isExtensionsJsonValid, setIsExtensionsJsonValid] = useState(true);
    
    const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
    const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false);

    const handleChange = useCallback((field: keyof SillyTavernPreset, value: any) => {
        onUpdate({ ...preset, [field]: value });
    }, [preset, onUpdate]);

    useEffect(() => {
        const jsonString = JSON.stringify(preset.extensions, null, 2);
        setExtensionsJson(jsonString === undefined ? '{}' : jsonString);
        setIsExtensionsJsonValid(true);
    }, [preset.extensions]);
    
    useEffect(() => {
        // Tìm nạp các mô hình chỉ khi OpenRouter được chọn và các mô hình chưa được tìm nạp.
        if (preset.chat_completion_source === 'openrouter' && openRouterModels.length === 0 && !isFetchingModels) {
            const fetchModels = async () => {
                setIsFetchingModels(true);
                setFetchModelsError(null);
                try {
                    const models = await getOpenRouterModels();
                    setOpenRouterModels(models);
                } catch (error) {
                    setFetchModelsError(error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.');
                } finally {
                    setIsFetchingModels(false);
                }
            };
            fetchModels();
        }
    }, [preset.chat_completion_source, openRouterModels.length, isFetchingModels]);

    const handleExtensionsChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setExtensionsJson(newValue);
      try {
        const parsed = newValue.trim() === '' ? {} : JSON.parse(newValue);
        onUpdate({ ...preset, extensions: parsed });
        setIsExtensionsJsonValid(true);
      } catch (error) {
        setIsExtensionsJsonValid(false);
      }
    }, [preset, onUpdate]);

    const filteredOpenRouterModels = useMemo(() => {
        if (!showFreeModelsOnly) {
            return openRouterModels;
        }
        return openRouterModels.filter(model =>
            model.pricing.prompt === '0' && model.pricing.completion === '0'
        );
    }, [openRouterModels, showFreeModelsOnly]);

    useEffect(() => {
        if (showFreeModelsOnly && preset.openrouter_model) {
            const isSelectedModelVisible = filteredOpenRouterModels.some(m => m.id === preset.openrouter_model);
            if (!isSelectedModelVisible) {
                // The currently selected model is not free, so deselect it.
                handleChange('openrouter_model', '');
            }
        }
    }, [showFreeModelsOnly, filteredOpenRouterModels, preset.openrouter_model, handleChange]);
    
    const selectedModelDetails = useMemo(() => {
        if (!preset.openrouter_model || openRouterModels.length === 0) {
            return null;
        }
        return openRouterModels.find(m => m.id === preset.openrouter_model);
    }, [preset.openrouter_model, openRouterModels]);
    
    const formatPrice = (price: string) => {
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum === 0) return '$0.00';
        // Price is per token, so multiply by 1 million for the standard display rate.
        const pricePerMillion = priceNum * 1_000_000;
        return `$${pricePerMillion.toFixed(4)}`;
    };


    return (
        <div>
            <Section title="Thông tin cơ bản" description="Tên, nhận xét và lời nhắc hệ thống chung cho preset này.">
                <LabeledInput label="Tên Preset" value={preset.name || ''} onChange={(e) => handleChange('name', e.target.value)} />
                <LabeledInput label="Nhận xét" value={preset.comment || ''} onChange={(e) => handleChange('comment', e.target.value)} />
                <LabeledTextarea label="Lời nhắc Hệ thống" value={preset.system_prompt || ''} onChange={(e) => handleChange('system_prompt', e.target.value)} rows={6} containerClassName="md:col-span-2" />
            </Section>
            
            <Section title="API & Lựa chọn Mô hình" description="Cấu hình nguồn API và chọn các mô hình cụ thể cho các nhà cung cấp khác nhau.">
                <LabeledSelect 
                    label="Nguồn Hoàn thành Trò chuyện" 
                    value={preset.chat_completion_source || 'custom'} 
                    onChange={(e) => handleChange('chat_completion_source', e.target.value)}
                    options={[
                        { value: 'custom', label: 'Custom / Gemini' },
                        { value: 'openrouter', label: 'OpenRouter' },
                        { value: 'proxy', label: 'Reverse Proxy (Kingfall)' }
                    ]}
                    tooltipText="Chọn dịch vụ AI sẽ xử lý các yêu cầu trò chuyện. 'Custom/Gemini' sử dụng cài đặt Gemini. 'OpenRouter' cho phép bạn sử dụng bất kỳ mô hình nào được OpenRouter hỗ trợ. 'Reverse Proxy' cho phép kết nối với Server trung gian không cần API Key."
                />

                {preset.chat_completion_source === 'openrouter' && (
                    <>
                        <div className="md:col-span-2">
                             {isFetchingModels ? (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Mô hình OpenRouter</label>
                                    <div className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-400">
                                        <Loader message="Đang tải các mô hình..." />
                                    </div>
                                </div>
                             ) : fetchModelsError ? (
                                 <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Mô hình OpenRouter</label>
                                    <div className="w-full bg-red-900/30 border border-red-500/50 rounded-md p-3 text-red-400 text-sm">
                                        <p className="font-bold">Không thể tải mô hình:</p>
                                        <p>{fetchModelsError}</p>
                                    </div>
                                 </div>
                             ) : (
                                 <div className="space-y-4">
                                    <div>
                                        <Tooltip text="Chọn một mô hình từ danh sách được cung cấp bởi OpenRouter.">
                                            <label className="block text-sm font-medium text-slate-300 mb-1 cursor-help">Mô hình OpenRouter</label>
                                        </Tooltip>
                                        <SearchableSelect
                                            value={preset.openrouter_model || ''}
                                            onChange={value => handleChange('openrouter_model', value)}
                                            options={filteredOpenRouterModels.map(m => ({ value: m.id, label: `${m.name} (${m.id})`}))}
                                            placeholder="Chọn hoặc tìm kiếm một mô hình..."
                                        />
                                    </div>
                                    <div className="bg-slate-700/50 p-2 rounded-lg">
                                        <ToggleInput
                                            label="Chỉ hiển thị các mô hình miễn phí"
                                            checked={showFreeModelsOnly}
                                            onChange={setShowFreeModelsOnly}
                                            tooltipText="Lọc danh sách để chỉ hiển thị các mô hình không có chi phí sử dụng."
                                        />
                                    </div>
                                 </div>
                             )}
                        </div>
                        {selectedModelDetails && (
                             <div className="md:col-span-2 bg-slate-900/50 p-4 rounded-lg text-sm space-y-2">
                                 <h4 className="font-bold text-slate-300">Chi tiết Mô hình đã chọn</h4>
                                 <div className="flex justify-between">
                                     <span className="text-slate-400">Độ dài Ngữ cảnh:</span>
                                     <span className="font-mono text-amber-400">{selectedModelDetails.context_length.toLocaleString()} tokens</span>
                                 </div>
                                  <div className="flex justify-between">
                                     <span className="text-slate-400">Giá Prompt / 1M token:</span>
                                     <span className="font-mono text-green-400">{formatPrice(selectedModelDetails.pricing.prompt)}</span>
                                 </div>
                                  <div className="flex justify-between">
                                     <span className="text-slate-400">Giá Completion / 1M token:</span>
                                     <span className="font-mono text-green-400">{formatPrice(selectedModelDetails.pricing.completion)}</span>
                                 </div>
                             </div>
                        )}
                    </>
                )}
                
                {preset.chat_completion_source === 'proxy' && (
                    <div className="md:col-span-2 space-y-4">
                        <LabeledInput 
                            label="Model ID (Tên mã model)" 
                            value={preset.proxy_model || ''} 
                            onChange={(e) => handleChange('proxy_model', e.target.value)} 
                            placeholder="ví dụ: gemini-3-pro-preview"
                            tooltipText="Nhập chính xác ID của Model mà bạn muốn sử dụng trên Google. Ví dụ: 'gemini-3-pro-preview', 'gemini-2.5-pro'. Hệ thống Proxy sẽ chuyển tiếp tên này."
                        />
                        <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-lg text-xs text-blue-200">
                            <strong>Lưu ý:</strong> Khi dùng Proxy, các tham số Nhiệt độ (Temp), Top P, Top K bên dưới sẽ được gửi kèm đến Proxy để 'cook' mô hình theo ý bạn.
                        </div>
                    </div>
                )}
            </Section>

            {preset.chat_completion_source === 'openrouter' && (
                <Section title="Cài đặt OpenRouter" description="Cài đặt dành riêng cho API OpenRouter.">
                    <LabeledSelect label="Sắp xếp Mô hình" value={preset.openrouter_sort_models || 'alphabetically'} onChange={e => handleChange('openrouter_sort_models', e.target.value)} options={[{value: 'alphabetically', label: 'Theo Bảng chữ cái'}, {value: 'popularity', label: 'Theo Mức độ phổ biến'}]} />
                    <LabeledSelect label="Middle-Out" value={preset.openrouter_middleout || 'off'} onChange={e => handleChange('openrouter_middleout', e.target.value)} options={[{value: 'off', label: 'Tắt'}, {value: 'on', label: 'Bật'}]} />
                    <div className="md:col-span-2 space-y-4">
                        <ToggleInput label="Sử dụng Dự phòng" checked={preset.openrouter_use_fallback ?? false} onChange={v => handleChange('openrouter_use_fallback', v)} />
                        <ToggleInput label="Nhóm Mô hình" checked={preset.openrouter_group_models ?? true} onChange={v => handleChange('openrouter_group_models', v)} />
                        <ToggleInput label="Cho phép Dự phòng" checked={preset.openrouter_allow_fallbacks ?? false} onChange={v => handleChange('openrouter_allow_fallbacks', v)} />
                    </div>
                    <StringArrayInput label="Nhà cung cấp" values={preset.openrouter_providers ?? []} onChange={v => handleChange('openrouter_providers', v)} />
                </Section>
            )}

            <Section title="Sampling Cốt lõi" description="Các tham số chính kiểm soát sự sáng tạo và tính mạch lạc của AI.">
                <SliderInput label="Nhiệt độ (Temperature)" value={preset.temp ?? 1} onChange={v => handleChange('temp', v)} min={0} max={2} step={0.01} tooltipText="Kiểm soát sự ngẫu nhiên của đầu ra. Giá trị cao hơn (ví dụ: 1.2) làm cho phản hồi sáng tạo và đa dạng hơn. Giá trị thấp hơn (ví dụ: 0.7) làm cho phản hồi an toàn và dễ đoán hơn." />
                <SliderInput label="Top P" value={preset.top_p ?? 0.9} onChange={v => handleChange('top_p', v)} min={0} max={1} step={0.01} tooltipText="Còn gọi là 'Nucleus Sampling'. AI chỉ xem xét một nhóm các từ có xác suất cao nhất cộng lại bằng giá trị này (ví dụ: 0.9 = 90%). Giúp cân bằng giữa sáng tạo và mạch lạc." />
                <SliderInput label="Top K" value={preset.top_k ?? 0} onChange={v => handleChange('top_k', v)} min={0} max={100} step={1} tooltipText="Giới hạn AI chỉ chọn từ trong số 'K' từ có xác suất cao nhất. Giá trị 0 sẽ tắt chức năng này. Thường thì không cần dùng cả Top P và Top K cùng lúc." />
                <SliderInput label="Typical P" value={preset.typical_p ?? 1} onChange={v => handleChange('typical_p', v)} min={0} max={1} step={0.01} tooltipText="Một kỹ thuật sampling nhằm loại bỏ các token có xác suất thấp 'không điển hình'. Giá trị 1 vô hiệu hóa nó. Giá trị thấp hơn làm cho đầu ra ít ngạc nhiên hơn." />
            </Section>

            <Section title="Thử nghiệm (Experimental)" description="Các tính năng mới của API Gemini. Sử dụng cẩn thận.">
                <SliderInput
                    label="Thinking Budget (Token Suy Nghĩ)"
                    value={preset.thinking_budget ?? 0}
                    onChange={v => handleChange('thinking_budget', v)}
                    min={0}
                    max={32768}
                    step={1024}
                    tooltipText="TÍNH NĂNG THỬ NGHIỆM: Đặt ngân sách token cho quá trình suy luận nội tại của mô hình. Đặt về 0 để tắt. Lưu ý: Không phải mọi mô hình đều hỗ trợ tính năng này (có thể gây lỗi API). Gemini 2.5 Pro hỗ trợ tối đa 32768."
                />
            </Section>

            <Section title="Sampling Nâng cao" description="Các tham số sampling ít phổ biến hơn để tinh chỉnh thêm.">
                 <SliderInput label="Tail Free Sampling (TFS)" value={preset.tfs ?? 1} onChange={v => handleChange('tfs', v)} min={0} max={1} step={0.01} tooltipText="Một kỹ thuật sampling khác, loại bỏ các token có xác suất thấp nhất. Giá trị 1 vô hiệu hóa nó. Giá trị thấp hơn làm tăng tính mạch lạc." />
                 <SliderInput label="Top A" value={preset.top_a ?? 0} onChange={v => handleChange('top_a', v)} min={0} max={1} step={0.01} tooltipText="Một kỹ thuật sampling thử nghiệm. Tương tự như Top-P và Top-K, nhưng nó chọn các token dựa trên xác suất của chúng so với token có khả năng nhất." />
                 <SliderInput label="Min P" value={preset.min_p ?? 0} onChange={v => handleChange('min_p', v)} min={0} max={1} step={0.01} tooltipText="Đặt một ngưỡng xác suất tối thiểu cho các token được xem xét. Các token có xác suất thấp hơn giá trị này sẽ bị loại bỏ." />
                 <SliderInput label="Epsilon Cutoff" value={preset.epsilon_cutoff ?? 0} onChange={v => handleChange('epsilon_cutoff', v)} min={0} max={10} step={0.1} tooltipText="Một tham số sampling nâng cao. Giữ lại các token có xác suất lớn hơn (Epsilon * xác suất của token có khả năng nhất). Giá trị 0 sẽ tắt." />
                 <SliderInput label="ETA DDIM" value={preset.eta_ddim ?? 0} onChange={v => handleChange('eta_ddim', v)} min={0} max={10} step={0.1} tooltipText="Một tham số sampling nâng cao, thường liên quan đến các mô hình khuếch tán. Giá trị 0 làm cho việc lấy mẫu có tính quyết định hơn." />
            </Section>

            <Section title="Repetition Penalty" description="Ngăn AI lặp lại chính nó.">
                <SliderInput label="Repetition Penalty" value={preset.repetition_penalty ?? 1.1} onChange={v => handleChange('repetition_penalty', v)} min={1} max={2} step={0.01} tooltipText="Ngăn AI lặp lại các từ và cụm từ đã nói gần đây. Giá trị lớn hơn 1.0 sẽ phạt việc lặp lại. Giá trị quá cao (ví dụ: 1.5) có thể làm cho văn bản trở nên kỳ lạ." />
                <SliderInput label="Repetition Penalty Range" value={preset.repetition_penalty_range ?? 0} onChange={v => handleChange('repetition_penalty_range', v)} min={0} max={8192} step={1} tooltipText="Xác định số lượng token gần nhất mà Repetition Penalty sẽ áp dụng. Giá trị 0 có nghĩa là không có giới hạn." />
                <SliderInput label="Encoder Repetition Penalty" value={preset.encoder_repetition_penalty ?? 1} onChange={v => handleChange('encoder_repetition_penalty', v)} min={1} max={2} step={0.01} tooltipText="Tương tự như Repetition Penalty, nhưng áp dụng cho lời nhắc đầu vào thay vì đầu ra được tạo ra." />
                <SliderInput label="No Repeat N-gram Size" value={preset.no_repeat_ngram_size ?? 0} onChange={v => handleChange('no_repeat_ngram_size', v)} min={0} max={20} step={1} tooltipText="Ngăn chặn việc lặp lại các chuỗi (n-gram) có độ dài chính xác bằng giá trị này. Giá trị 2 sẽ ngăn lặp lại các cặp từ." />
            </Section>

            <Section title="Advanced Penalty" description="Kiểm soát sự lặp lại của các token cụ thể và sự hiện diện của các khái niệm mới.">
                <SliderInput label="Frequency Penalty" value={preset.frequency_penalty ?? 0} onChange={v => handleChange('frequency_penalty', v)} min={0} max={2} step={0.01} tooltipText="Giảm khả năng một token xuất hiện lại dựa trên tần suất nó đã xuất hiện trong văn bản. Giá trị dương sẽ khuyến khích các từ mới." />
                <SliderInput label="Presence Penalty" value={preset.presence_penalty ?? 0} onChange={v => handleChange('presence_penalty', v)} min={0} max={2} step={0.01} tooltipText="Giảm khả năng một token xuất hiện lại nếu nó đã xuất hiện ít nhất một lần. Khuyến khích việc giới thiệu các chủ đề mới." />
            </Section>

            <Section title="Mirostat Sampling" description="Một thuật toán sampling thay thế để kiểm soát tính bất ngờ của văn bản.">
                <LabeledSelect
                    label="Chế độ Mirostat"
                    value={preset.mirostat_mode ?? 0}
                    onChange={(e) => handleChange('mirostat_mode', parseInt(e.target.value, 10))}
                    options={[
                        { value: 0, label: 'Tắt' },
                        { value: 1, label: 'Mirostat V1' },
                        { value: 2, label: 'Mirostat V2' }
                    ]}
                    tooltipText="Một thuật toán sampling thay thế. Thay vì dùng Temperature/Top P, nó cố gắng duy trì một mức độ 'ngạc nhiên' (perplexity) nhất định cho văn bản. Mirostat V2 thường được khuyên dùng nếu bạn muốn thử."
                />
                <SliderInput label="Mirostat Tau" value={preset.mirostat_tau ?? 5} onChange={v => handleChange('mirostat_tau', v)} min={0} max={10} step={0.1} tooltipText="Mục tiêu 'ngạc nhiên' cho Mirostat. Giá trị cao hơn cho phép văn bản đa dạng hơn." />
                <SliderInput label="Mirostat ETA" value={preset.mirostat_eta ?? 0.1} onChange={v => handleChange('mirostat_eta', v)} min={0} max={1} step={0.01} tooltipText="Tốc độ học của Mirostat. Kiểm soát tốc độ thuật toán điều chỉnh để đạt được Tau mục tiêu. Giá trị nhỏ hơn (ví dụ: 0.1) thường ổn định hơn." />
            </Section>
            
            <Section title="Kiểm soát Tạo văn bản" description="Các cài đặt kỹ thuật về cách tạo và kết thúc văn bản.">
                 <LabeledInput label="Độ dài tối thiểu (Min Length)" value={preset.min_length ?? 0} onChange={(e) => handleChange('min_length', e.target.value)} type="text" tooltipText="Đặt số lượng token tối thiểu mà AI phải tạo ra. Hữu ích để tránh các câu trả lời quá ngắn." />
                 <LabeledInput label="Độ dài cắt bỏ (Truncation Length)" value={preset.truncation_length ?? 4096} onChange={(e) => handleChange('truncation_length', e.target.value)} type="text" tooltipText="Giới hạn tối đa số lượng token mà mô hình có thể 'nhìn thấy' từ lịch sử trò chuyện và ngữ cảnh." />
                 <LabeledInput label="Max Tokens" value={preset.max_tokens ?? 2048} onChange={(e) => handleChange('max_tokens', e.target.value)} type="text" tooltipText="Số lượng token tối đa mà AI sẽ tạo ra trong một lần phản hồi." />
                 <LabeledInput label="Số lượng thế hệ (n)" value={preset.n ?? 1} onChange={(e) => handleChange('n', e.target.value)} type="text" tooltipText="Số lượng phản hồi khác nhau mà AI sẽ tạo ra cho mỗi lời nhắc. Thường được đặt là 1." />
                 <LabeledInput label="Seed" value={preset.seed ?? -1} onChange={(e) => handleChange('seed', e.target.value)} type="text" tooltipText="Một số cố định để đảm bảo kết quả đầu ra có thể lặp lại. Giá trị -1 có nghĩa là ngẫu nhiên." />
                 <div className="space-y-4">
                    <ToggleInput label="Do Sample" checked={preset.do_sample ?? true} onChange={v => handleChange('do_sample', v)} tooltipText="Bật hoặc tắt các phương pháp sampling (như Temperature, Top P, Top K). Nếu tắt, AI sẽ luôn chọn từ có xác suất cao nhất." />
                    <ToggleInput label="Ban EOS Token" checked={preset.ban_eos_token ?? false} onChange={v => handleChange('ban_eos_token', v)} tooltipText="Ngăn mô hình tạo ra token 'Kết thúc chuỗi' (End-Of-Sequence). Có thể khiến AI nói dài hơn nhưng cũng có thể dẫn đến các câu không hoàn chỉnh." />
                    <ToggleInput label="Add BOS Token" checked={preset.add_bos_token ?? true} onChange={v => handleChange('add_bos_token', v)} tooltipText="Tự động thêm token 'Bắt đầu chuỗi' (Beginning-Of-Sequence) vào đầu lời nhắc. Hầu hết các mô hình đều yêu cầu điều này." />
                 </div>
            </Section>

             <Section title="Dừng Chuỗi" description="Các chuỗi văn bản cụ thể sẽ khiến AI ngừng tạo văn bản.">
                <StringArrayInput label="Stopping Strings" values={preset.stopping_strings ?? []} onChange={v => handleChange('stopping_strings', v)} tooltipText="Khi AI tạo ra một trong các chuỗi này, nó sẽ ngay lập tức dừng lại. Hữu ích để ngăn AI đóng vai người dùng." />
                <StringArrayInput label="Custom Stopping Strings" values={preset.custom_stopping_strings ?? []} onChange={v => handleChange('custom_stopping_strings', v)} tooltipText="Các chuỗi dừng bổ sung do người dùng định nghĩa, hoạt động cùng với các chuỗi dừng mặc định." />
             </Section>

             <Section title="Chế độ Instruct & Định dạng" description="Cấu hình cho các mô hình theo dạng instruct và định dạng lời nhắc.">
                <LabeledInput label="WI Format" value={preset.wi_format || ''} onChange={(e) => handleChange('wi_format', e.target.value)} tooltipText="Định dạng mẫu cho mỗi mục World Info được chèn vào lời nhắc. Sử dụng các biến giữ chỗ `{{keys}}` và `{{content}}`." />
                <LabeledInput label="Scenario Format" value={preset.scenario_format || ''} onChange={(e) => handleChange('scenario_format', e.target.value)} tooltipText="Định dạng mẫu cho trường Kịch bản. Mặc định là `{{scenario}}`. Có thể thêm văn bản bao quanh." />
                <LabeledInput label="Personality Format" value={preset.personality_format || ''} onChange={(e) => handleChange('personality_format', e.target.value)} tooltipText="Định dạng mẫu cho trường Tính cách. Mặc định là `{{personality}}`. Có thể thêm văn bản bao quanh." />
                <LabeledInput label="Custom Prompt Post-Processing" value={preset.custom_prompt_post_processing || ''} onChange={(e) => handleChange('custom_prompt_post_processing', e.target.value)} />
                <LabeledTextarea label="Mẫu Instruct" value={preset.instruct_template || ''} onChange={(e) => handleChange('instruct_template', e.target.value)} rows={8} containerClassName="md:col-span-2" tooltipText="Mẫu được sử dụng cho các mô hình 'instruct' (hướng dẫn). Xác định cách lời nhắc của người dùng và lịch sử được định dạng." />
             </Section>
             
             <Section title="Advanced Chat Behavior" description="Control various aspects of chat interaction and special prompts.">
                 <LabeledInput label="Bias Preset Selected" value={preset.bias_preset_selected || ''} onChange={(e) => handleChange('bias_preset_selected', e.target.value)} />
                 <LabeledSelect label="Names Behavior" value={preset.names_behavior ?? -1} onChange={(e) => handleChange('names_behavior', parseInt(e.target.value, 10))} options={[{value: -1, label: 'Default'}, {value: 0, label: 'Behavior 0'}, {value: 1, label: 'Behavior 1'}]} />
                 <LabeledInput label="Gửi nếu trống" value={preset.send_if_empty || ''} onChange={(e) => handleChange('send_if_empty', e.target.value)} />
                 <LabeledTextarea label="Impersonation Prompt" value={preset.impersonation_prompt || ''} onChange={(e) => handleChange('impersonation_prompt', e.target.value)} rows={4} containerClassName="md:col-span-2" />
                 <LabeledTextarea label="New Chat Prompt" value={preset.new_chat_prompt || ''} onChange={(e) => handleChange('new_chat_prompt', e.target.value)} rows={4} containerClassName="md:col-span-2" />
                 <LabeledTextarea label="New Group Chat Prompt" value={preset.new_group_chat_prompt || ''} onChange={(e) => handleChange('new_group_chat_prompt', e.target.value)} rows={4} containerClassName="md:col-span-2" />
                 <LabeledTextarea label="New Example Chat Prompt" value={preset.new_example_chat_prompt || ''} onChange={(e) => handleChange('new_example_chat_prompt', e.target.value)} rows={4} containerClassName="md:col-span-2" />
                 <LabeledTextarea label="Continue Nudge Prompt" value={preset.continue_nudge_prompt || ''} onChange={(e) => handleChange('continue_nudge_prompt', e.target.value)} rows={4} containerClassName="md:col-span-2" />
                 <LabeledTextarea label="Group Nudge Prompt" value={preset.group_nudge_prompt || ''} onChange={(e) => handleChange('group_nudge_prompt', e.target.value)} rows={4} containerClassName="md:col-span-2" />
                 <LabeledTextarea label="Assistant Prefill" value={preset.assistant_prefill || ''} onChange={(e) => handleChange('assistant_prefill', e.target.value)} rows={4} containerClassName="md:col-span-2" />
                 <LabeledTextarea label="Assistant Impersonation" value={preset.assistant_impersonation || ''} onChange={(e) => handleChange('assistant_impersonation', e.target.value)} rows={4} containerClassName="md:col-span-2" />
                 <LabeledTextarea label="Continue Postfix" value={preset.continue_postfix || ''} onChange={(e) => handleChange('continue_postfix', e.target.value)} rows={4} containerClassName="md:col-span-2" />
             </Section>

             <Section title="Cài đặt Linh tinh" description="Various toggles and settings for advanced control over generation and features.">
                <LabeledSelect label="Inline Image Quality" value={preset.inline_image_quality || 'auto'} onChange={e => handleChange('inline_image_quality', e.target.value)} options={[{value: 'auto', label: 'Auto'}, {value: 'low', label: 'Low'}, {value: 'high', label: 'High'}]} />
                <LabeledSelect label="Reasoning Effort" value={preset.reasoning_effort || 'high'} onChange={e => handleChange('reasoning_effort', e.target.value)} options={[{value: 'high', label: 'High'}, {value: 'low', label: 'Low'}]} />
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ToggleInput label="Wrap in Quotes" checked={preset.wrap_in_quotes ?? false} onChange={v => handleChange('wrap_in_quotes', v)} tooltipText="Tự động bao bọc phản hồi của AI trong dấu ngoặc kép." />
                    <ToggleInput label="Max Context Unlocked" checked={preset.max_context_unlocked ?? false} onChange={v => handleChange('max_context_unlocked', v)} tooltipText="Bỏ qua các giới hạn ngữ cảnh được đề xuất của mô hình và cố gắng gửi càng nhiều càng tốt." />
                    
                    {preset.chat_completion_source !== 'openrouter' && preset.chat_completion_source !== 'proxy' && (
                        <>
                            <ToggleInput label="Stream OpenAI" checked={preset.stream_openai ?? true} onChange={v => handleChange('stream_openai', v)} tooltipText="Bật chế độ streaming cho các phản hồi từ API OpenAI." />
                            <ToggleInput label="Claude Use SysPrompt" checked={preset.claude_use_sysprompt ?? true} onChange={v => handleChange('claude_use_sysprompt', v)} tooltipText="Sử dụng trường lời nhắc hệ thống gốc khi tương tác với các mô hình Claude." />
                            <ToggleInput label="Use Makersuite SysPrompt" checked={preset.use_makersuite_sysprompt ?? true} onChange={v => handleChange('use_makersuite_sysprompt', v)} tooltipText="Sử dụng trường lời nhắc hệ thống gốc khi tương tác với các mô hình Google/Makersuite." />
                            <LabeledSelect label="VertexAI Auth Mode" value={preset.vertexai_auth_mode || 'full'} onChange={e => handleChange('vertexai_auth_mode', e.target.value)} options={[{value: 'full', label: 'Full'}, {value: 'token', label: 'Token only'}]} />
                        </>
                    )}

                    <ToggleInput label="Show External Models" checked={preset.show_external_models ?? false} onChange={v => handleChange('show_external_models', v)} />
                    <ToggleInput label="Squash System Messages" checked={preset.squash_system_messages ?? true} onChange={v => handleChange('squash_system_messages', v)} tooltipText="Nén nhiều lời nhắc hệ thống liên tiếp thành một trước khi gửi đến API." />
                    <ToggleInput label="Image Inlining" checked={preset.image_inlining ?? true} onChange={v => handleChange('image_inlining', v)} tooltipText="Cho phép hiển thị hình ảnh trực tiếp trong cuộc trò chuyện." />
                    <ToggleInput label="Video Inlining" checked={preset.video_inlining ?? true} onChange={v => handleChange('video_inlining', v)} tooltipText="Cho phép hiển thị video trực tiếp trong cuộc trò chuyện." />
                    <ToggleInput label="Bypass Status Check" checked={preset.bypass_status_check ?? true} onChange={v => handleChange('bypass_status_check', v)} tooltipText="Bỏ qua việc kiểm tra trạng thái API trước khi gửi yêu cầu." />
                    <ToggleInput label="Continue Prefill" checked={preset.continue_prefill ?? false} onChange={v => handleChange('continue_prefill', v)} tooltipText="Sử dụng một phần phản hồi trước đó để 'mồi' cho mô hình trong lệnh 'Tiếp tục'." />
                    <ToggleInput label="Function Calling" checked={preset.function_calling ?? false} onChange={v => handleChange('function_calling', v)} tooltipText="Kích hoạt khả năng gọi hàm (function calling) của mô hình." />
                    <ToggleInput label="Show Thoughts" checked={preset.show_thoughts ?? true} onChange={v => handleChange('show_thoughts', v)} tooltipText="Hiển thị 'suy nghĩ' hoặc quá trình lý luận của mô hình nếu API hỗ trợ." />
                    <ToggleInput label="Enable Web Search" checked={preset.enable_web_search ?? false} onChange={v => handleChange('enable_web_search', v)} tooltipText="Cho phép mô hình thực hiện tìm kiếm trên web để trả lời câu hỏi." />
                    <ToggleInput label="Request Images" checked={preset.request_images ?? false} onChange={v => handleChange('request_images', v)} tooltipText="Cho phép mô hình tạo ra hình ảnh như một phần của phản hồi." />
                </div>
             </Section>

             <Section title="Phần mở rộng (Nâng cao)" description="Dữ liệu JSON thô cho các phần mở rộng của SillyTavern. Chỉ chỉnh sửa nếu bạn biết mình đang làm gì.">
                <LabeledTextarea 
                    label="Đối tượng JSON phần mở rộng" 
                    value={extensionsJson} 
                    onChange={handleExtensionsChange} 
                    rows={10} 
                    containerClassName="md:col-span-2"
                    className={!isExtensionsJsonValid ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
                />
                {!isExtensionsJsonValid && <p className="text-sm text-red-400 mt-1 md:col-span-2">JSON không hợp lệ.</p>}
             </Section>
        </div>
    );
}