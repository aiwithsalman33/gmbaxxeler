export interface RotationImage {
  id: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** Least recently used first, so nothing repeats until the whole folder has been used. */
export function rotationOrder<T extends RotationImage>(images: T[]): T[] {
  return [...images].sort((a, b) => {
    const left = a.lastUsedAt?.getTime() ?? 0;
    const right = b.lastUsedAt?.getTime() ?? 0;
    return left - right || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  });
}

export function pickImages<T extends RotationImage>(images: T[], reserved: Set<string>, count: number): T[] {
  return rotationOrder(images.filter((image) => !reserved.has(image.id))).slice(0, count);
}
