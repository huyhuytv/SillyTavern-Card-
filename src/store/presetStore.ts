
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SillyTavernPreset } from '../types';
import { parsePresetFile } from '../services/presetParser';
import * as dbService from '../services/dbService';
import defaultPreset from '../data/defaultPreset';
import geminiCoT12kPreset from '../data/geminiCoT12kPreset';

interface PresetState {
  presets: SillyTavernPreset[];
  activePresetName: string | null;
  isLoading: boolean;
  error: string;
}

interface PresetActions {
  reloadPresets: () => Promise<void>;
  addPreset: (file: File) => Promise<void>;
  deleteActivePreset: () => Promise<void>;
  updateActivePreset: (preset: SillyTavernPreset) => Promise<void>;
  setActivePresetName: (name: string | null) => void;
  revertActivePreset: () => Promise<void>;
}

export const usePresetStore = create<PresetState & PresetActions>()(
  immer((set, get) => ({
    presets: [],
    activePresetName: null,
    isLoading: true,
    error: '',

    reloadPresets: async () => {
      set((state) => { state.isLoading = true; });
      try {
        let presets = await dbService.getAllPresets();
        let needsSave = false;

        // Ensure defaults exist
        if (!presets.some(p => p.name === defaultPreset.name)) {
          await dbService.savePreset(defaultPreset);
          presets.unshift(defaultPreset);
          needsSave = true;
        }
        if (!presets.some(p => p.name === geminiCoT12kPreset.name)) {
          await dbService.savePreset(geminiCoT12kPreset);
          presets.push(geminiCoT12kPreset);
          needsSave = true;
        }

        if (needsSave) presets = await dbService.getAllPresets();

        set((state) => {
            state.presets = presets;
            if (!state.activePresetName) {
                state.activePresetName = defaultPreset.name;
            }
            state.error = '';
        });
      } catch (err) {
        set((state) => { state.error = err instanceof Error ? err.message : 'Error loading presets'; });
      } finally {
        set((state) => { state.isLoading = false; });
      }
    },

    addPreset: async (file: File) => {
      set((state) => { state.error = ''; });
      try {
        const loadedPreset = await parsePresetFile(file);
        const { presets } = get();
        const existing = presets.find(p => p.name === loadedPreset.name);
        
        if (existing) {
             // We can't use window.confirm in store easily without blocking, 
             // but strictly speaking we should just overwrite or rename.
             // For now, overwrite.
        }

        await dbService.savePreset(loadedPreset);
        const allPresets = await dbService.getAllPresets();
        
        set((state) => {
            state.presets = allPresets;
            state.activePresetName = loadedPreset.name;
        });
      } catch (err) {
        set((state) => { state.error = err instanceof Error ? err.message : 'Error importing preset'; });
      }
    },

    deleteActivePreset: async () => {
        const { activePresetName } = get();
        if (!activePresetName || activePresetName === defaultPreset.name || activePresetName === geminiCoT12kPreset.name) return;

        try {
            await dbService.deletePreset(activePresetName);
            set((state) => {
                state.presets = state.presets.filter(p => p.name !== activePresetName);
                state.activePresetName = defaultPreset.name;
            });
        } catch (err) {
            set((state) => { state.error = 'Failed to delete preset'; });
        }
    },

    updateActivePreset: async (preset: SillyTavernPreset) => {
        try {
            await dbService.savePreset(preset);
            set((state) => {
                const idx = state.presets.findIndex(p => p.name === preset.name);
                if (idx !== -1) state.presets[idx] = preset;
            });
        } catch (err) {
            set((state) => { state.error = 'Failed to update preset'; });
        }
    },

    setActivePresetName: (name) => {
        set((state) => { state.activePresetName = name; });
    },

    revertActivePreset: async () => {
        const { activePresetName } = get();
        if (!activePresetName) return;
        
        try {
            if (activePresetName === defaultPreset.name) {
                await dbService.savePreset(defaultPreset);
                get().updateActivePreset(defaultPreset);
                return;
            }
            if (activePresetName === geminiCoT12kPreset.name) {
                await dbService.savePreset(geminiCoT12kPreset);
                get().updateActivePreset(geminiCoT12kPreset);
                return;
            }
            // For custom presets, reload from DB to "undo" unsaved changes if we had an edit buffer,
            // but currently edits are live-saved. So revert might mean something else in future.
            // For now, just reload from DB.
            const all = await dbService.getAllPresets();
            const original = all.find(p => p.name === activePresetName);
            if (original) {
                set((state) => {
                    const idx = state.presets.findIndex(p => p.name === activePresetName);
                    if (idx !== -1) state.presets[idx] = original;
                });
            }
        } catch (e) {}
    }
  }))
);
