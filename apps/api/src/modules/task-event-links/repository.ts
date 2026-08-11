import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@lifeos/database";
import type { TaskEventLinkResponse } from "@lifeos/contracts";

export class TaskLinkTargetNotFoundError extends Error {}
export class EventLinkTargetNotFoundError extends Error {}
export class TaskEventLinkNotFoundError extends Error {}

export interface CreateTaskEventLinkValues {
  taskId: string;
  calendarId: string;
  eventUid: string;
}

export interface TaskEventLinkRepository {
  listLinks(userId: string): Promise<TaskEventLinkResponse[]>;
  createLink(
    userId: string,
    values: CreateTaskEventLinkValues,
  ): Promise<{ link: TaskEventLinkResponse; created: boolean }>;
  deleteLink(userId: string, linkId: string): Promise<void>;
}

type LinkRecord = {
  id: string;
  taskId: string;
  createdAt: Date;
  task: {
    title: string;
    deletedAt: Date | null;
  };
  calendarEvent: {
    uid: string;
    title: string;
    deletedAt: Date | null;
    calendar: {
      externalId: string;
      deletedAt: Date | null;
    };
  };
};

const mapLink = (link: LinkRecord): TaskEventLinkResponse => {
  const taskAvailable = link.task.deletedAt === null;
  const eventAvailable =
    link.calendarEvent.deletedAt === null &&
    link.calendarEvent.calendar.deletedAt === null;
  return {
    id: link.id,
    task: {
      id: link.taskId,
      title: taskAvailable ? link.task.title : null,
      available: taskAvailable,
    },
    event: {
      calendarId: link.calendarEvent.calendar.externalId,
      uid: link.calendarEvent.uid,
      title: eventAvailable ? link.calendarEvent.title : null,
      available: eventAvailable,
    },
    createdAt: link.createdAt.toISOString(),
  };
};

const linkInclude = {
  task: {
    select: {
      title: true,
      deletedAt: true,
    },
  },
  calendarEvent: {
    select: {
      uid: true,
      title: true,
      deletedAt: true,
      calendar: {
        select: {
          externalId: true,
          deletedAt: true,
        },
      },
    },
  },
} as const;

export class PrismaTaskEventLinkRepository implements TaskEventLinkRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listLinks(userId: string): Promise<TaskEventLinkResponse[]> {
    const links = await this.database.taskEventLink.findMany({
      where: { userId },
      include: linkInclude,
      orderBy: { createdAt: "asc" },
    });
    return links.map((link) => mapLink(link as LinkRecord));
  }

  async createLink(
    userId: string,
    values: CreateTaskEventLinkValues,
  ): Promise<{ link: TaskEventLinkResponse; created: boolean }> {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.task.findFirst({
        where: { id: values.taskId, userId, deletedAt: null },
        select: { id: true },
      });
      if (!task) throw new TaskLinkTargetNotFoundError();

      const calendar = await transaction.calendar.findFirst({
        where: {
          externalId: values.calendarId,
          userId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!calendar) throw new EventLinkTargetNotFoundError();
      const calendarEvent = await transaction.calendarEvent.findFirst({
        where: {
          calendarId: calendar.id,
          uid: values.eventUid,
          userId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!calendarEvent) throw new EventLinkTargetNotFoundError();

      const linkIdentity = {
        userId,
        taskId: task.id,
        calendarEventId: calendarEvent.id,
      };
      const candidateId = randomUUID();
      const link = await transaction.taskEventLink.upsert({
        where: {
          userId_taskId_calendarEventId: linkIdentity,
        },
        create: { id: candidateId, ...linkIdentity },
        update: {},
        include: linkInclude,
      });
      const created = link.id === candidateId;
      if (created) {
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "task.calendar_event.linked",
            entityType: "TaskEventLink",
            entityId: link.id,
            metadata: {
              taskId: task.id,
              calendarId: values.calendarId,
              eventUid: values.eventUid,
            },
          },
        });
      }
      return {
        link: mapLink(link as LinkRecord),
        created,
      };
    });
  }

  async deleteLink(userId: string, linkId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const link = await transaction.taskEventLink.findFirst({
        where: { id: linkId, userId },
        include: {
          calendarEvent: {
            select: {
              uid: true,
              calendar: { select: { externalId: true } },
            },
          },
        },
      });
      if (!link) throw new TaskEventLinkNotFoundError();
      await transaction.taskEventLink.delete({ where: { id: link.id } });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "task.calendar_event.unlinked",
          entityType: "TaskEventLink",
          entityId: link.id,
          metadata: {
            taskId: link.taskId,
            calendarId: link.calendarEvent.calendar.externalId,
            eventUid: link.calendarEvent.uid,
          },
        },
      });
    });
  }
}
