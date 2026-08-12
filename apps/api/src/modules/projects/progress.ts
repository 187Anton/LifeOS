import type { ProjectProgressResponse } from "@lifeos/contracts";

export interface ProgressItem {
  status: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

const count = (items: ProgressItem[], completedStatus: string) => {
  const eligible = items.filter(
    (item) =>
      item.archivedAt === null &&
      item.deletedAt === null &&
      item.status !== "cancelled",
  );
  return {
    completed: eligible.filter((item) => item.status === completedStatus)
      .length,
    total: eligible.length,
  };
};

/**
 * Every active goal, milestone and task contributes the same weight. Cancelled,
 * archived and soft-deleted records are excluded; an empty project has no
 * measurable progress instead of an invented zero-percent value.
 */
export const calculateProjectProgress = ({
  goals,
  milestones,
  tasks,
}: {
  goals: ProgressItem[];
  milestones: ProgressItem[];
  tasks: ProgressItem[];
}): ProjectProgressResponse => {
  const breakdown = {
    goals: count(goals, "completed"),
    milestones: count(milestones, "completed"),
    tasks: count(tasks, "done"),
  };
  const totalItems = Object.values(breakdown).reduce(
    (total, value) => total + value.total,
    0,
  );
  const completedItems = Object.values(breakdown).reduce(
    (total, value) => total + value.completed,
    0,
  );
  return {
    state: totalItems === 0 ? "no_data" : "available",
    percent:
      totalItems === 0 ? null : Math.round((completedItems / totalItems) * 100),
    completedItems,
    totalItems,
    breakdown,
  };
};
