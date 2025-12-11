
import React, { useRef } from 'react';
import { PresetEditor } from './PresetEditor';
import { PromptEditor } from './PromptEditor';
import { exportPresetToJson } from '../services/presetExporter';
import { usePreset } from '../contexts/PresetContext';
import { Loader } from './Loader';

type ActiveSubTab = 'config' | 'prompts';

const SubTabButton: React.FC<{
  tabId: ActiveSubTab;
  currentTab: ActiveSubTab;
  onClick: (tabId: ActiveSubTab) => void;
  children: React.ReactNode;
}> = ({ tabId, currentTab, onClick, children }) => (
  <button
    role="tab"
    id={`preset-subtab-${tabId}`}
    aria-controls={`preset-subtabpanel-${tabId}`}
    aria-selected={currentTab === tabId}
    onClick={() => onClick(tabId)}
    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
      currentTab === tabId
        ? 'bg-sky-600 text-white'
        : 'text-slate-300 bg-slate-700 hover:bg-slate-600'
    }`}
  >
    {children}
  </button>
);

export const PresetTab: React.FC = () => {
    const {
        presets,
        activePresetName,
        isLoading,
        error,
        addPreset,
        deleteActivePreset,
        updateActivePreset,
        setActivePresetName,
        revertActivePreset,
    } = usePreset();
    const [activeSubTab, setActiveSubTab] = React.useState<'config' | 'prompts'>('config');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activePreset = presets.find(p => p.name === activePresetName) || null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            addPreset(e.target.files[0]);
            // Reset the input value to allow uploading the same file again
            e.target.value = '';
        }
    };

    const handleExport = () => {
        if (!activePreset) return;
        // Clean export name: Remove extension and add .json back, no _edited
        const exportFileName = `${activePreset.name.replace(/\.json$/i, '')}.json`;
        exportPresetToJson(activePreset, exportFileName);
    }

    if (isLoading && presets.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader message="Đang tải presets..." />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left Panel: Preset List and Actions */}
            <div className="md:col-span-1 bg-slate-800/50 p-4 rounded-xl flex flex-col gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-200 mb-4">Presets</h3>
                    <div className="flex flex-col gap-2">
                        {presets.map(preset => (
                            <button
                                key={preset.name}
                                onClick={() => setActivePresetName(preset.name)}
                                className={`w-full text-left p-3 rounded-lg transition-colors text-sm font-medium truncate ${
                                    activePresetName === preset.name
                                        ? 'bg-sky-600/30 ring-2 ring-sky-500 text-white'
                                        : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
                                }`}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-auto space-y-2">
                    {error && <p className="text-red-400 text-xs p-2 bg-red-900/30 rounded">{error}</p>}
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="sr-only"
                        accept=".json"
                        onChange={handleFileChange}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                    >
                        Tải lên Preset
                    </button>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={deleteActivePreset}
                            disabled={!activePreset || activePreset.name === "Mặc định"}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 text-sm rounded-lg transition-colors duration-200 disabled:bg-slate-600 disabled:cursor-not-allowed"
                        >
                            Xóa
                        </button>
                        <button
                            onClick={revertActivePreset}
                            disabled={!activePreset || activePreset.name === "Mặc định"}
                             className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 text-sm rounded-lg transition-colors duration-200 disabled:bg-slate-600 disabled:cursor-not-allowed"
                        >
                           Hoàn tác
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={!activePreset}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 text-sm rounded-lg transition-colors duration-200 disabled:bg-slate-600 disabled:cursor-not-allowed"
                        >
                           Xuất
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel: Editor */}
            <div className="md:col-span-2">
                {activePreset ? (
                    <div>
                        <div role="tablist" aria-label="Preset Editor Sections" className="mb-6 flex justify-center">
                             <div className="p-1 bg-slate-800 rounded-lg flex space-x-1">
                                <SubTabButton tabId="config" currentTab={activeSubTab} onClick={setActiveSubTab}>Cấu hình</SubTabButton>
                                <SubTabButton tabId="prompts" currentTab={activeSubTab} onClick={setActiveSubTab}>Lời nhắc</SubTabButton>
                             </div>
                        </div>
                        <div
                          id={`preset-subtabpanel-${activeSubTab}`} 
                          role="tabpanel" 
                          aria-labelledby={`preset-subtab-${activeSubTab}`}
                          className="focus:outline-none"
                          tabIndex={0}
                        >
                            {activeSubTab === 'config' && <PresetEditor preset={activePreset} onUpdate={updateActivePreset} />}
                            {activeSubTab === 'prompts' && <PromptEditor preset={activePreset} onUpdate={updateActivePreset} />}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full bg-slate-800/30 rounded-xl border-2 border-dashed border-slate-700">
                       <div className="text-center text-slate-500">
                           <p className="font-semibold">Chọn một preset để chỉnh sửa</p>
                       </div>
                    </div>
                )}
            </div>
        </div>
    );
};