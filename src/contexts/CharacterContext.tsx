import React, { createContext, useReducer, useContext, useCallback, ReactNode, Dispatch, useEffect } from 'react';
import type { CharacterCard, Lorebook } from '../types';
import { parseCharacterFile, processRawCard } from '../services/cardParser';
import { normalizeCharacterBook } from '../services/lorebookParser';
import { useLorebook } from './LorebookContext';
import * as dbService from '../services/dbService';
import { defaultCharacterRaw } from '../data/defaultCharacter';


export interface CharacterInContext {
  card: CharacterCard;
  fileName: string;
  avatarUrl: string | null;
  avatarFile: File | null;
}

// 1. Define State and Action Types
interface CharacterState {
  characters: CharacterInContext[];
  activeCharacterFileName: string | null;
  error: string;
  isLoading: boolean;
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_CHARACTERS'; payload: CharacterInContext[] }
  | { type: 'SET_ACTIVE_CHARACTER'; payload: string | null }
  | { type: 'ADD_OR_UPDATE_CHARACTER'; payload: CharacterInContext }
  | { type: 'DELETE_CHARACTER'; payload: string };

// 2. Initial State
const initialState: CharacterState = {
  characters: [],
  activeCharacterFileName: null,
  error: '',
  isLoading: true, // Start loading from DB
};

// 3. Reducer Function
const characterReducer = (state: CharacterState, action: Action): CharacterState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_CHARACTERS':
      return { ...state, characters: action.payload, error: '' };
    case 'SET_ACTIVE_CHARACTER':
      return { ...state, activeCharacterFileName: action.payload };
    case 'ADD_OR_UPDATE_CHARACTER': {
      const existingIndex = state.characters.findIndex(c => c.fileName === action.payload.fileName);
      const newCharacters = [...state.characters];
      if (existingIndex > -1) {
        // Revoke old blob URL before replacing
        const oldUrl = newCharacters[existingIndex].avatarUrl;
        if (oldUrl && oldUrl !== action.payload.avatarUrl) {
          URL.revokeObjectURL(oldUrl);
        }
        newCharacters[existingIndex] = action.payload;
      } else {
        newCharacters.push(action.payload);
      }
      return { ...state, characters: newCharacters };
    }
    case 'DELETE_CHARACTER': {
      const charToDelete = state.characters.find(c => c.fileName === action.payload);
      if (charToDelete?.avatarUrl) {
        URL.revokeObjectURL(charToDelete.avatarUrl);
      }
      const remaining = state.characters.filter(c => c.fileName !== action.payload);
      let newActive: string | null = null;
      if (state.activeCharacterFileName === action.payload) {
        if (remaining.length > 0) {
          const deletedIndex = state.characters.findIndex(c => c.fileName === action.payload);
          const newIndex = Math.min(deletedIndex, remaining.length - 1);
          newActive = remaining[newIndex].fileName;
        }
      } else {
        newActive = state.activeCharacterFileName;
      }
      return { ...state, characters: remaining, activeCharacterFileName: newActive };
    }
    default:
      return state;
  }
};

// 4. Create Context
interface CharacterContextType extends CharacterState {
  dispatch: Dispatch<Action>;
  loadCharacter: (file: File) => Promise<void>;
  deleteActiveCharacter: () => Promise<void>;
  updateActiveCharacter: (card: CharacterCard) => Promise<void>;
  setActiveCharacterFileName: (name: string | null) => void;
  setAvatarForActiveCharacter: (fileName: string, url: string | null, file: File | null) => void;
}

const CharacterContext = createContext<CharacterContextType | undefined>(undefined);

// 5. Create Provider Component
// FIX: Changed component definition to use React.FC for explicit children prop typing.
export const CharacterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(characterReducer, initialState);
  const { lorebooks, addLorebook } = useLorebook();

  useEffect(() => {
    const restoreSession = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        let storedCharacters = await dbService.getAllCharacters();

        if (storedCharacters.length === 0) {
            const defaultCard = processRawCard(defaultCharacterRaw);
            const defaultFileName = "Tuệ Thu Sinh (Mặc định).json";
            
            const defaultCharacter: CharacterInContext = {
              card: defaultCard,
              fileName: defaultFileName,
              avatarUrl: null, // No avatar for default
              avatarFile: null,
            };
            
            const storable = await dbService.characterToStorable(defaultCharacter);
            await dbService.saveCharacter(storable);
            
            // Re-fetch to have a single source of truth from the DB
            storedCharacters = await dbService.getAllCharacters();
        }
        
        const charactersInContext: CharacterInContext[] = storedCharacters.map(stored => {
          let avatarUrl: string | null = null;
          let avatarFile: File | null = null;
          if (stored.avatar) {
            avatarFile = new File([stored.avatar.buffer], stored.avatar.name, { type: stored.avatar.type });
            avatarUrl = URL.createObjectURL(avatarFile);
          }
          return { card: stored.card, fileName: stored.fileName, avatarUrl, avatarFile };
        });
        dispatch({ type: 'SET_CHARACTERS', payload: charactersInContext });
        if (charactersInContext.length > 0) {
          dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: charactersInContext[0].fileName });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi khôi phục nhân vật.';
        dispatch({ type: 'SET_ERROR', payload: msg });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    restoreSession();

    return () => {
      // Cleanup blob URLs on unmount
      state.characters.forEach(c => {
        if (c.avatarUrl) URL.revokeObjectURL(c.avatarUrl);
      });
    };
  }, [addLorebook]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect to synchronize characters when lorebooks are deleted.
  useEffect(() => {
    if (state.isLoading) return; // Don't sync while initially loading

    const lorebookNames = new Set(lorebooks.map(lb => lb.name));
    const charactersToUpdate: CharacterInContext[] = [];

    // Find characters that need updating due to deleted lorebooks
    state.characters.forEach(character => {
        let needsUpdate = false;
        // Deep copy to prevent direct state mutation
        const newCard = JSON.parse(JSON.stringify(character.card)) as CharacterCard;

        // Part 1: Synchronize 'attached_lorebooks'
        const originalAttached = newCard.attached_lorebooks || [];
        if (originalAttached.length > 0) {
            const newAttached = originalAttached.filter(name => lorebookNames.has(name));

            if (newAttached.length < originalAttached.length) {
                if (newAttached.length > 0) {
                    newCard.attached_lorebooks = newAttached;
                } else {
                    delete newCard.attached_lorebooks;
                }
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            charactersToUpdate.push({ ...character, card: newCard });
        }
    });

    // If we found characters that need updates, process them.
    if (charactersToUpdate.length > 0) {
        const updatedCharacterMap = new Map(charactersToUpdate.map(c => [c.fileName, c]));
        const newCharacterList = state.characters.map(c => 
            updatedCharacterMap.get(c.fileName) || c
        );
        
        // Persist changes to DB asynchronously
        Promise.all(
            charactersToUpdate.map(char => 
                dbService.characterToStorable(char).then(dbService.saveCharacter)
            )
        ).then(() => {
            // Update state once DB is successfully updated
            dispatch({ type: 'SET_CHARACTERS', payload: newCharacterList });
        }).catch(err => {
            const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi đồng bộ hóa nhân vật sau khi xóa sổ tay.';
            dispatch({ type: 'SET_ERROR', payload: msg });
        });
    }
  }, [lorebooks, state.characters, state.isLoading]);


  const loadCharacter = useCallback(async (file: File) => {
    dispatch({ type: 'SET_ERROR', payload: '' });
    try {
      const { card, avatarUrl } = await parseCharacterFile(file);
      const avatarFile = avatarUrl ? file : null;

      // New logic to handle instructional first_mes
      if (
        card.alternate_greetings &&
        card.alternate_greetings.length > 0 &&
        card.first_mes &&
        card.first_mes.length > 300 && 
        card.first_mes.trim().startsWith('#')
      ) {
        // This seems to be an instructional first_mes, let's use the first alternate greeting instead.
        card.first_mes = card.alternate_greetings[0];
      }

      const character: CharacterInContext = { card, fileName: file.name, avatarUrl, avatarFile };
      
      const storable = await dbService.characterToStorable(character);
      await dbService.saveCharacter(storable);

      dispatch({ type: 'ADD_OR_UPDATE_CHARACTER', payload: character });
      dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: file.name });
      
      // When a new character with a char_book is loaded:
      // 1. The book is already on the `card` object and will be displayed.
      // 2. We create a copy as a new World Lorebook for reusability.
      if (card.char_book && card.char_book.entries && card.char_book.entries.length > 0) {
        const normalizedBook = normalizeCharacterBook(card.char_book);
        if (normalizedBook) {
            const newLorebook: Lorebook = {
                name: `[Nhân vật] ${card.name}.json`,
                // Deep copy the book to ensure the World Lorebook is independent
                book: JSON.parse(JSON.stringify(normalizedBook)),
            };
            // This will add the new lorebook to the LorebookContext
            await addLorebook(newLorebook);
        }
      }

    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định.' });
    }
  }, [addLorebook]);

  const deleteActiveCharacter = useCallback(async () => {
    if (!state.activeCharacterFileName) return;
    try {
      await dbService.deleteCharacter(state.activeCharacterFileName);
      dispatch({ type: 'DELETE_CHARACTER', payload: state.activeCharacterFileName });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Lỗi khi xóa nhân vật.' });
    }
  }, [state.activeCharacterFileName]);

  const updateActiveCharacter = useCallback(async (card: CharacterCard) => {
    const activeCharacter = state.characters.find(c => c.fileName === state.activeCharacterFileName);
    if (!activeCharacter) return;
    
    const updatedCharacter: CharacterInContext = { ...activeCharacter, card };
    const storable = await dbService.characterToStorable(updatedCharacter);
    await dbService.saveCharacter(storable);
    dispatch({ type: 'ADD_OR_UPDATE_CHARACTER', payload: updatedCharacter });
  }, [state.characters, state.activeCharacterFileName]);

  const setActiveCharacterFileName = (name: string | null) => {
    dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: name });
  };
  
  const setAvatarForActiveCharacter = async (fileName: string, url: string | null, file: File | null) => {
      const character = state.characters.find(c => c.fileName === fileName);
      if (!character) return;

      const updatedCharacter: CharacterInContext = { ...character, avatarUrl: url, avatarFile: file };
      const storable = await dbService.characterToStorable(updatedCharacter);
      await dbService.saveCharacter(storable);
      dispatch({ type: 'ADD_OR_UPDATE_CHARACTER', payload: updatedCharacter });
  };

  return (
    <CharacterContext.Provider value={{ ...state, dispatch, loadCharacter, deleteActiveCharacter, updateActiveCharacter, setActiveCharacterFileName, setAvatarForActiveCharacter }}>
      {children}
    </CharacterContext.Provider>
  );
};

// 6. Create Custom Hook
export const useCharacter = (): CharacterContextType => {
  const context = useContext(CharacterContext);
  if (context === undefined) {
    throw new Error('useCharacter must be used within a CharacterProvider');
  }
  return context;
};
