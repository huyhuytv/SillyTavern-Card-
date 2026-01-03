
import React, { useRef, useState } from 'react';
import { CharacterEditor } from './CharacterEditor';
import { AnalysisPane } from './AnalysisPane';
import { useCharacter, CharacterInContext } from '../contexts/CharacterContext';
import { Loader } from './Loader';
import { CharacterBookFullScreenView } from './CharacterBookFullScreenView';
import type { WorldInfoEntry, CharacterCard } from '../types';

export const CharacterTab: React.FC = () => {
  const {
    characters,
    activeCharacterFileName,
    isLoading,
    error,
    loadCharacter,
    deleteActiveCharacter,
    updateActiveCharacter,
    setActiveCharacterFileName,
    setAvatarForActiveCharacter,
  } = useCharacter();

  const [isLorebookMode, setIsLorebookMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const activeCharacter = activeCharacterFileName
    ? characters.find(c => c.fileName === activeCharacterFileName)
    : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      loadCharacter(e.target.files[0]);
      e.target.value = ''; // Allow re-uploading the same file
    }
  };

  const handleSetAvatar = (character: CharacterInContext) => (url: string | null, file: File | null) => {
    setAvatarForActiveCharacter(character.fileName, url, file);
  };
  
  const handleLorebookSave = (updatedEntries: WorldInfoEntry[]) => {
      if (!activeCharacter) return;
      
      // Create a deep copy of the card to modify
      const newCard = JSON.parse(JSON.stringify(activeCharacter.card));
      
      if (!newCard.char_book) {
          newCard.char_book = { entries: [] };
      }
      newCard.char_book.entries = updatedEntries;
      
      updateActiveCharacter(newCard);
      setIsLorebookMode(false);
  };

  if (isLoading && characters.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader message="Đang tải nhân vật..." />
      </div>
    );
  }

  // --- RENDER LOGIC ---

  // 1. Full Screen Lorebook Mode (Exclusive View)
  if (isLorebookMode && activeCharacter) {
      return (
          <CharacterBookFullScreenView 
              initialEntries={activeCharacter.card.char_book?.entries || []}
              onSave={handleLorebookSave}
              onClose={() => setIsLorebookMode(false)}
          />
      );
  }

  // 2. Standard Character Editor Layout
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Left Panel: Character List and Actions */}
      <div className="md:col-span-1 bg-slate-800/50 p-4 rounded-xl flex flex-col gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-200 mb-4">Nhân vật</h3>
          <div className="flex flex-col gap-2">
            {characters.length === 0 ? (
                <p className="text-slate-500 text-sm italic text-center py-4">Chưa có nhân vật nào được tải.</p>
            ) : (
                characters.map(char => (
                  <button
                    key={char.fileName}
                    onClick={() => setActiveCharacterFileName(char.fileName)}
                    className={`w-full text-left p-3 rounded-lg transition-colors text-sm font-medium truncate ${
                      activeCharacterFileName === char.fileName
                        ? 'bg-sky-600/30 ring-2 ring-sky-500 text-white'
                        : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {char.fileName}
                  </button>
                ))
            )}
          </div>
        </div>

        <div className="mt-auto space-y-2">
          {error && <p className="text-red-400 text-xs p-2 bg-red-900/30 rounded">{error}</p>}
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept=".png,.json"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            Tải lên nhân vật
          </button>
          <button
            onClick={deleteActiveCharacter}
            disabled={!activeCharacter}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 text-sm rounded-lg transition-colors duration-200 disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            Xóa
          </button>
        </div>
      </div>

      {/* Right Panel: Editor */}
      <div className="md:col-span-2">
        {activeCharacter ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <CharacterEditor 
                  card={activeCharacter.card} 
                  onUpdate={updateActiveCharacter} 
                  onOpenLorebook={() => setIsLorebookMode(true)}
              />
            </div>
            <div className="lg:col-span-1">
              <AnalysisPane
                card={activeCharacter.card}
                onUpdate={updateActiveCharacter}
                fileName={activeCharacter.fileName}
                avatarUrl={activeCharacter.avatarUrl}
                avatarFile={activeCharacter.avatarFile}
                setAvatarUrl={(url) => handleSetAvatar(activeCharacter)(url, activeCharacter.avatarFile)}
                setAvatarFile={(file) => handleSetAvatar(activeCharacter)(activeCharacter.avatarUrl, file)}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full bg-slate-800/30 rounded-xl border-2 border-dashed border-slate-700 min-h-[60vh]">
            <div className="text-center text-slate-500">
              <p className="font-semibold">Chọn một nhân vật để chỉnh sửa</p>
              <p className="text-sm mt-1">Hoặc tải lên một nhân vật mới từ bảng điều khiển bên trái.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
