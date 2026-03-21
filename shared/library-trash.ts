/**
 * Library Trash — expiration logic for soft-deleted library items
 */

interface TrashItem {
  id: string;
  name: string;
  deletedAt: Date;
  [key: string]: any;
}

/**
 * Filters trash items that have expired (older than maxAgeDays).
 * Items with deletedAt exactly at maxAgeDays are considered expired.
 */
export function getExpiredTrashItems(
  allTrash: TrashItem[],
  maxAgeDays: number
): TrashItem[] {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  return allTrash.filter((item) => {
    return item.deletedAt.getTime() <= cutoff;
  });
}
