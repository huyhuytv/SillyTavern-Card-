
import React, { createContext, useReducer, useContext, useCallback, ReactNode, Dispatch, useEffect, useMemo } from 'react';
import type { UserPersona } from '../types';
import * as dbService from '../services/dbService';

const ACTIVE_PERSONA_ID_KEY = 'sillyTavernStudio_activePersonaId';

// Hồ sơ mặc định theo yêu cầu
const defaultUserPersona: UserPersona = {
  id: 'default_persona_hai',
  name: 'Hải',
  description: '', // Mô tả để trống
};

// 1. Define State and Action Types
interface UserPersonaState {
  personas: UserPersona[];
  activePersonaId: string | null;
  error: string;
  isLoading: boolean;
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_PERSONAS'; payload: UserPersona[] }
  | { type: 'SET_ACTIVE_PERSONA_ID'; payload: string | null }
  | { type: 'ADD_OR_UPDATE_PERSONA'; payload: UserPersona }
  | { type: 'DELETE_PERSONA'; payload: string };

// 2. Initial State
const initialState: UserPersonaState = {
  personas: [],
  activePersonaId: null,
  error: '',
  isLoading: true,
};

// 3. Reducer Function
const userPersonaReducer = (state: UserPersonaState, action: Action): UserPersonaState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_PERSONAS':
      return { ...state, personas: action.payload, error: '' };
    case 'SET_ACTIVE_PERSONA_ID':
      return { ...state, activePersonaId: action.payload };
    case 'ADD_OR_UPDATE_PERSONA': {
      const existingIndex = state.personas.findIndex(p => p.id === action.payload.id);
      const newPersonas = [...state.personas];
      if (existingIndex > -1) {
        newPersonas[existingIndex] = action.payload;
      } else {
        newPersonas.push(action.payload);
      }
      return { ...state, personas: newPersonas };
    }
    case 'DELETE_PERSONA': {
      const remaining = state.personas.filter(p => p.id !== action.payload);
      const newActiveId = state.activePersonaId === action.payload ? null : state.activePersonaId;
      return { ...state, personas: remaining, activePersonaId: newActiveId };
    }
    default:
      return state;
  }
};

// 4. Create Context
interface UserPersonaContextType extends UserPersonaState {
  dispatch: Dispatch<Action>;
  addOrUpdatePersona: (persona: UserPersona) => Promise<void>;
  deletePersona: (personaId: string) => Promise<void>;
  setActivePersonaId: (id: string | null) => void;
  activePersona: UserPersona | null;
  reloadPersonas: () => Promise<void>; // NEW
}

const UserPersonaContext = createContext<UserPersonaContextType | undefined>(undefined);

// 5. Create Provider Component
export const UserPersonaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(userPersonaReducer, initialState);

  const reloadPersonas = useCallback(async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        let personas = await dbService.getAllUserPersonas();
        
        // Nếu chưa có hồ sơ nào, tạo hồ sơ mặc định là "Hải"
        if (personas.length === 0) {
            await dbService.saveUserPersona(defaultUserPersona);
            personas = [defaultUserPersona];
        }

        dispatch({ type: 'SET_PERSONAS', payload: personas });
        
        const savedActiveId = localStorage.getItem(ACTIVE_PERSONA_ID_KEY);
        if (savedActiveId && personas.some(p => p.id === savedActiveId)) {
          dispatch({ type: 'SET_ACTIVE_PERSONA_ID', payload: savedActiveId });
        } else if (personas.length > 0) {
          // Nếu chưa chọn hồ sơ nào, tự động chọn cái đầu tiên (Hải)
          const defaultId = personas[0].id;
          localStorage.setItem(ACTIVE_PERSONA_ID_KEY, defaultId);
          dispatch({ type: 'SET_ACTIVE_PERSONA_ID', payload: defaultId });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi tải hồ sơ người dùng.';
        dispatch({ type: 'SET_ERROR', payload: msg });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
  }, []);

  useEffect(() => {
    reloadPersonas();
  }, []);

  const addOrUpdatePersona = useCallback(async (persona: UserPersona) => {
    try {
      await dbService.saveUserPersona(persona);
      dispatch({ type: 'ADD_OR_UPDATE_PERSONA', payload: persona });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi lưu hồ sơ.';
      dispatch({ type: 'SET_ERROR', payload: msg });
    }
  }, []);

  const deletePersona = useCallback(async (personaId: string) => {
    try {
      await dbService.deleteUserPersona(personaId);
      dispatch({ type: 'DELETE_PERSONA', payload: personaId });
      if (localStorage.getItem(ACTIVE_PERSONA_ID_KEY) === personaId) {
        localStorage.removeItem(ACTIVE_PERSONA_ID_KEY);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi xóa hồ sơ.';
      dispatch({ type: 'SET_ERROR', payload: msg });
    }
  }, []);

  const setActivePersonaId = useCallback((id: string | null) => {
    if (id) {
      localStorage.setItem(ACTIVE_PERSONA_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PERSONA_ID_KEY);
    }
    dispatch({ type: 'SET_ACTIVE_PERSONA_ID', payload: id });
  }, []);
  
  const activePersona = useMemo(() => {
    return state.personas.find(p => p.id === state.activePersonaId) || null;
  }, [state.personas, state.activePersonaId]);

  return (
    <UserPersonaContext.Provider value={{ ...state, dispatch, addOrUpdatePersona, deletePersona, setActivePersonaId, activePersona, reloadPersonas }}>
      {children}
    </UserPersonaContext.Provider>
  );
};

// 6. Create Custom Hook
export const useUserPersona = (): UserPersonaContextType => {
  const context = useContext(UserPersonaContext);
  if (context === undefined) {
    throw new Error('useUserPersona must be used within a UserPersonaProvider');
  }
  return context;
};
