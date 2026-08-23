import { MaterialInstance } from '../types/materials';

export interface MaterialAvailability {
  available: boolean;
  currentQuantity: number;
  requiredQuantity: number;
  materialId: string;
}

export function checkAvailability(
  materials: MaterialInstance[],
  requiredMaterials: Record<string, number>
): MaterialAvailability[] {
  const results: MaterialAvailability[] = [];

  for (const [materialId, requiredQuantity] of Object.entries(requiredMaterials)) {
    const stock = materials.find(m => m.materialId === materialId);
    const currentQuantity = stock?.quantity ?? 0;
    results.push({
      available: currentQuantity >= requiredQuantity,
      currentQuantity,
      requiredQuantity,
      materialId,
    });
  }

  return results;
}

export function canConsumeMaterials(
  materials: MaterialInstance[],
  requiredMaterials: Record<string, number>
): boolean {
  const availability = checkAvailability(materials, requiredMaterials);
  return availability.every(a => a.available);
}

export function consumeMaterial(
  materials: MaterialInstance[],
  materialId: string,
  quantity: number
): { success: boolean; materials: MaterialInstance[]; error?: string } {
  const updatedMaterials = materials.map(m => ({ ...m }));
  const index = updatedMaterials.findIndex(m => m.materialId === materialId);

  if (index === -1) {
    return {
      success: false,
      materials: updatedMaterials,
      error: `Material ${materialId} não encontrado no estoque`,
    };
  }

  if (updatedMaterials[index].quantity < quantity) {
    return {
      success: false,
      materials: updatedMaterials,
      error: `Quantidade insuficiente de ${materialId}: disponível ${updatedMaterials[index].quantity}, necessário ${quantity}`,
    };
  }

  updatedMaterials[index].quantity -= quantity;

  return {
    success: true,
    materials: updatedMaterials,
  };
}

export function consumeMaterials(
  materials: MaterialInstance[],
  requiredMaterials: Record<string, number>
): { success: boolean; materials: MaterialInstance[]; error?: string } {
  // First check all materials are available
  const availability = checkAvailability(materials, requiredMaterials);
  const unavailable = availability.filter(a => !a.available);

  if (unavailable.length > 0) {
    return {
      success: false,
      materials,
      error: `Materiais insuficientes: ${unavailable.map(u => `${u.materialId} (tem ${u.currentQuantity}, precisa ${u.requiredQuantity})`).join(', ')}`,
    };
  }

  // Consume all materials
  let updatedMaterials = materials.map(m => ({ ...m }));

  for (const [materialId, quantity] of Object.entries(requiredMaterials)) {
    const result = consumeMaterial(updatedMaterials, materialId, quantity);
    if (!result.success) {
      return { success: false, materials, error: result.error };
    }
    updatedMaterials = result.materials;
  }

  return {
    success: true,
    materials: updatedMaterials,
  };
}

export function addMaterial(
  materials: MaterialInstance[],
  materialId: string,
  quantity: number,
  location: string = 'site',
  origin: string = 'supplied'
): MaterialInstance[] {
  const updatedMaterials = materials.map(m => ({ ...m }));
  const index = updatedMaterials.findIndex(m => m.materialId === materialId);

  if (index >= 0) {
    updatedMaterials[index].quantity += quantity;
  } else {
    updatedMaterials.push({
      materialId,
      quantity,
      status: 'disponivel',
      location,
      origin,
    });
  }

  return updatedMaterials;
}

export function getMaterialQuantity(materials: MaterialInstance[], materialId: string): number {
  const material = materials.find(m => m.materialId === materialId);
  return material?.quantity ?? 0;
}