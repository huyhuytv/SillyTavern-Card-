import React, { createContext, useReducer, useContext, useCallback, ReactNode, Dispatch, useEffect } from 'react';
import type { Lorebook } from '../types';
import { parseLorebookFile } from '../services/lorebookParser';
import * as dbService from '../services/dbService';

// 1. Define State and Action Types
interface LorebookState {
  lorebooks: Lorebook[];
  error: string;
  isLoading: boolean;
}

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; payload: { lorebooks: Lorebook[]; errors: string[] } }
  | { type: 'LOAD_ERROR'; payload: string }
  | { type: 'ADD_LOREBOOK'; payload: Lorebook }
  | { type: 'UPDATE_LOREBOOK'; payload: Lorebook }
  | { type: 'DELETE_LOREBOOK'; payload: string };

// 2. Initial State
const initialState: LorebookState = {
  lorebooks: [],
  error: '',
  isLoading: false,
};

// 3. Reducer Function
const lorebookReducer = (state: LorebookState, action: Action): LorebookState => {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, error: '' };
    case 'LOAD_SUCCESS':
      // Filter out duplicates that might already be in state from a previous action
      const newLorebooks = action.payload.lorebooks.filter(
        nl => !state.lorebooks.some(sl => sl.name === nl.name)
      );
      return {
        ...state,
        isLoading: false,
        lorebooks: [...state.lorebooks, ...newLorebooks],
        error: action.payload.errors.join('\n'),
      };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'ADD_LOREBOOK':
      // Avoid adding duplicates
      if (state.lorebooks.some(lb => lb.name === action.payload.name)) {
        return state;
      }
      return { ...state, lorebooks: [...state.lorebooks, action.payload] };
    case 'UPDATE_LOREBOOK':
      return {
        ...state,
        lorebooks: state.lorebooks.map(lb =>
          lb.name === action.payload.name ? action.payload : lb
        ),
      };
    case 'DELETE_LOREBOOK':
      return {
        ...state,
        lorebooks: state.lorebooks.filter(lb => lb.name !== action.payload),
      };
    default:
      return state;
  }
};

// 4. Create Context
interface LorebookContextType extends LorebookState {
  dispatch: Dispatch<Action>;
  loadLorebooks: (files: FileList) => Promise<void>;
  addLorebook: (lorebook: Lorebook) => Promise<void>;
  updateLorebook: (lorebook: Lorebook) => Promise<void>;
  deleteLorebook: (name: string) => Promise<void>;
}

const LorebookContext = createContext<LorebookContextType | undefined>(undefined);

// 5. Create Provider Component
// FIX: Changed component definition to use React.FC for explicit children prop typing.
export const LorebookProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(lorebookReducer, initialState);

  useEffect(() => {
    const loadFromDb = async () => {
      dispatch({ type: 'LOAD_START' });
      try {
        const lorebooksFromDb = await dbService.getAllLorebooks();
        dispatch({ type: 'LOAD_SUCCESS', payload: { lorebooks: lorebooksFromDb, errors: [] } });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Lỗi khi tải Sổ tay Thế giới từ bộ nhớ cục bộ.';
        dispatch({ type: 'LOAD_ERROR', payload: message });
      }
    };
    loadFromDb();
  }, []);

  const loadLorebooks = useCallback(async (files: FileList) => {
    dispatch({ type: 'LOAD_START' });
    const newLorebooks: Lorebook[] = [];
    const errors: string[] = [];
    const existingNames = new Set(state.lorebooks.map(lb => lb.name));

    for (const file of Array.from(files)) {
      if (existingNames.has(file.name)) continue;
      try {
        const loadedLorebook = await parseLorebookFile(file);
        await dbService.saveLorebook(loadedLorebook);
        newLorebooks.push(loadedLorebook);
        existingNames.add(file.name);
      } catch (err) {
        errors.push(`Lỗi tệp ${file.name}: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`);
      }
    }
    dispatch({ type: 'LOAD_SUCCESS', payload: { lorebooks: newLorebooks, errors } });
  }, [state.lorebooks]);
  
  const addLorebook = useCallback(async (lorebook: Lorebook) => {
    if (state.lorebooks.some(lb => lb.name === lorebook.name)) {
        return;
    }
    try {
        await dbService.saveLorebook(lorebook);
        dispatch({ type: 'ADD_LOREBOOK', payload: lorebook });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Lỗi khi thêm Sổ tay Thế giới vào bộ nhớ.';
        dispatch({ type: 'LOAD_ERROR', payload: message });
    }
  }, [state.lorebooks]);

  const updateLorebook = useCallback(async (lorebook: Lorebook) => {
    try {
        await dbService.saveLorebook(lorebook);
        dispatch({ type: 'UPDATE_LOREBOOK', payload: lorebook });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Lỗi khi cập nhật Sổ tay Thế giới trong bộ nhớ.';
        dispatch({ type: 'LOAD_ERROR', payload: message });
    }
  }, []);

  const deleteLorebook = useCallback(async (name: string) => {
    try {
        await dbService.deleteLorebook(name);
        dispatch({ type: 'DELETE_LOREBOOK', payload: name });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Lỗi khi xóa Sổ tay Thế giới khỏi bộ nhớ.';
        dispatch({ type: 'LOAD_ERROR', payload: message });
    }
  }, []);

  return (
    <LorebookContext.Provider value={{ ...state, dispatch, loadLorebooks, addLorebook, updateLorebook, deleteLorebook }}>
      {children}
    </LorebookContext.Provider>
  );
};

// 6. Create Custom Hook
export const useLorebook = (): LorebookContextType => {
  const context = useContext(LorebookContext);
  if (context === undefined) {
    throw new Error('useLorebook must be used within a LorebookProvider');
  }
  return context;
};
