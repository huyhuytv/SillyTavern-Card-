import React, { createContext, useReducer, useContext, useCallback, ReactNode, Dispatch, useEffect } from 'react';
import type { SillyTavernPreset } from '../types';
import { parsePresetFile } from '../services/presetParser';
import * as dbService from '../services/dbService';
import defaultPreset from '../data/defaultPreset';

// 1. Define State and Action Types
interface PresetState {
  presets: SillyTavernPreset[];
  activePresetName: string | null;
  error: string;
  isLoading: boolean;
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PRESETS'; payload: SillyTavernPreset[] }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_ACTIVE_PRESET'; payload: string | null }
  | { type: 'UPDATE_PRESET'; payload: SillyTavernPreset }
  | { type: 'DELETE_PRESET'; payload: string };

// 2. Initial State
const initialState: PresetState = {
  presets: [],
  activePresetName: null,
  error: '',
  isLoading: true,
};

// 3. Reducer Function
const presetReducer = (state: PresetState, action: Action): PresetState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_PRESETS':
      return { ...state, presets: action.payload, error: '' };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_ACTIVE_PRESET':
      return { ...state, activePresetName: action.payload };
    case 'UPDATE_PRESET':
      return {
        ...state,
        presets: state.presets.map(p => p.name === action.payload.name ? action.payload : p),
      };
    case 'DELETE_PRESET':
      const newPresets = state.presets.filter(p => p.name !== action.payload);
      const newActiveName = state.activePresetName === action.payload ? defaultPreset.name : state.activePresetName;
      return { ...state, presets: newPresets, activePresetName: newActiveName };
    default:
      return state;
  }
};

// 4. Create Context
interface PresetContextType extends PresetState {
  dispatch: Dispatch<Action>;
  addPreset: (file: File) => Promise<void>;
  deleteActivePreset: () => Promise<void>;
  updateActivePreset: (preset: SillyTavernPreset) => Promise<void>;
  setActivePresetName: (name: string | null) => void;
  revertActivePreset: () => Promise<void>;
}

const PresetContext = createContext<PresetContextType | undefined>(undefined);

// 5. Create Provider Component
export const PresetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(presetReducer, initialState);

  useEffect(() => {
    const loadPresetsFromDb = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        let presets = await dbService.getAllPresets();
        if (presets.length === 0) {
          await dbService.savePreset(defaultPreset);
          presets.push(defaultPreset);
        } else if (!presets.some(p => p.name === defaultPreset.name)) {
          // If default is missing for some reason, add it.
          presets.unshift(defaultPreset);
          await dbService.savePreset(defaultPreset);
        }
        dispatch({ type: 'SET_PRESETS', payload: presets });
        if (!state.activePresetName) {
            dispatch({ type: 'SET_ACTIVE_PRESET', payload: presets[0].name });
        }
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Lỗi không xác định khi tải presets.' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    loadPresetsFromDb();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addPreset = useCallback(async (file: File) => {
    dispatch({ type: 'SET_ERROR', payload: '' });
    try {
      const loadedPreset = await parsePresetFile(file);
      const existing = state.presets.find(p => p.name === loadedPreset.name);
      if (existing && !window.confirm(`Preset "${loadedPreset.name}" đã tồn tại. Bạn có muốn ghi đè lên nó không?`)) {
          return;
      }
      await dbService.savePreset(loadedPreset);
      // reload all presets to ensure consistency
      const presets = await dbService.getAllPresets();
      dispatch({ type: 'SET_PRESETS', payload: presets });
      dispatch({ type: 'SET_ACTIVE_PRESET', payload: loadedPreset.name });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Lỗi không xác định khi thêm preset.' });
    }
  }, [state.presets]);

  const deleteActivePreset = useCallback(async () => {
    if (!state.activePresetName || state.activePresetName === defaultPreset.name) return;
    try {
      await dbService.deletePreset(state.activePresetName);
      dispatch({ type: 'DELETE_PRESET', payload: state.activePresetName });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Lỗi khi xóa preset.' });
    }
  }, [state.activePresetName]);

  const updateActivePreset = useCallback(async (preset: SillyTavernPreset) => {
    try {
      await dbService.savePreset(preset);
      dispatch({ type: 'UPDATE_PRESET', payload: preset });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Lỗi khi cập nhật preset.' });
    }
  }, []);
  
  const setActivePresetName = (name: string | null) => {
      dispatch({ type: 'SET_ACTIVE_PRESET', payload: name });
  };
  
  const revertActivePreset = useCallback(async () => {
      if (!state.activePresetName) return;
      try {
          const allPresets = await dbService.getAllPresets();
          const originalPreset = allPresets.find(p => p.name === state.activePresetName);
          if (originalPreset) {
              dispatch({ type: 'UPDATE_PRESET', payload: originalPreset });
          }
      } catch (err) {
          dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Lỗi khi hoàn tác preset.' });
      }
  }, [state.activePresetName]);

  return (
    <PresetContext.Provider value={{ ...state, dispatch, addPreset, deleteActivePreset, updateActivePreset, setActivePresetName, revertActivePreset }}>
      {children}
    </PresetContext.Provider>
  );
};

// 6. Create Custom Hook
export const usePreset = (): PresetContextType => {
  const context = useContext(PresetContext);
  if (context === undefined) {
    throw new Error('usePreset must be used within a PresetProvider');
  }
  return context;
};
