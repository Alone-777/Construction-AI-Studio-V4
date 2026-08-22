import { create } from 'zustand';
import type { Character, Material, Tool, Camera, ConstructionType } from '../core/types';
import { getLibraryItems, saveLibraryItem, deleteLibraryItem } from '../db/repository';

interface LibraryState {
  /* ─── Dados das bibliotecas ─── */
  characters: Character[];
  materials: Material[];
  tools: Tool[];
  cameras: Camera[];
  constructions: ConstructionType[];

  /* ─── Carregamento ─── */
  loaded: boolean;

  /* ─── Ações ─── */
  loadAll: () => Promise<void>;
  addCharacter: (character: Character) => Promise<void>;
  addMaterial: (material: Material) => Promise<void>;
  addTool: (tool: Tool) => Promise<void>;
  addCamera: (camera: Camera) => Promise<void>;
  addConstruction: (construction: ConstructionType) => Promise<void>;
  removeItem: (category: string, id: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  characters: [],
  materials: [],
  tools: [],
  cameras: [],
  constructions: [],
  loaded: false,

  loadAll: async () => {
    if (get().loaded) return;
    const [chars, mats, tls, cams, cons] = await Promise.all([
      getLibraryItems('character'),
      getLibraryItems('material'),
      getLibraryItems('tool'),
      getLibraryItems('camera'),
      getLibraryItems('construction'),
    ]);
    set({
      characters: chars.map(r => r.data as unknown as Character),
      materials: mats.map(r => r.data as unknown as Material),
      tools: tls.map(r => r.data as unknown as Tool),
      cameras: cams.map(r => r.data as unknown as Camera),
      constructions: cons.map(r => r.data as unknown as ConstructionType),
      loaded: true,
    });
  },

  addCharacter: async (character) => {
    await saveLibraryItem('character', character.name, character as unknown as Record<string, unknown>);
    set((s) => ({ characters: [...s.characters, character] }));
  },

  addMaterial: async (material) => {
    await saveLibraryItem('material', material.name, material as unknown as Record<string, unknown>);
    set((s) => ({ materials: [...s.materials, material] }));
  },

  addTool: async (tool) => {
    await saveLibraryItem('tool', tool.name, tool as unknown as Record<string, unknown>);
    set((s) => ({ tools: [...s.tools, tool] }));
  },

  addCamera: async (camera) => {
    await saveLibraryItem('camera', camera.id, camera as unknown as Record<string, unknown>);
    set((s) => ({ cameras: [...s.cameras, camera] }));
  },

  addConstruction: async (construction) => {
    await saveLibraryItem('construction', construction.name, construction as unknown as Record<string, unknown>);
    set((s) => ({ constructions: [...s.constructions, construction] }));
  },

  removeItem: async (category, id) => {
    await deleteLibraryItem(id);
    set((s) => {
      switch (category) {
        case 'character': return { characters: s.characters.filter(c => c.id !== id) };
        case 'material': return { materials: s.materials.filter(m => m.id !== id) };
        case 'tool': return { tools: s.tools.filter(t => t.id !== id) };
        case 'camera': return { cameras: s.cameras.filter(c => c.id !== id) };
        case 'construction': return { constructions: s.constructions.filter(c => c.id !== id) };
        default: return {};
      }
    });
  },
}));
