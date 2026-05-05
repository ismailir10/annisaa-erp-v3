// Registry-shape tests for lib/timeline/events.ts.
//
// Catches typos + cross-resource map errors at test time so /build never
// commits a broken bridge map (e.g. Student → 'student.soft-deletes' typo).
//
// Cycle: docs/cycles/2026-05-06-p1-timeline-registry.md
import { describe, expect, it } from "vitest";

import { TimelineVisibility } from "@/lib/generated/prisma/client";
import {
  RESOURCE_TO_SOFT_DELETE_KIND,
  TIMELINE_EVENTS,
  type TimelineEventKind,
} from "../events";

const KEBAB_CASE_KIND = /^[a-z]+\.[a-z]+(-[a-z]+)*$/;
const KIND_KEYS = Object.keys(TIMELINE_EVENTS) as TimelineEventKind[];
const VISIBILITY_VALUES = new Set(Object.values(TimelineVisibility));

describe("TIMELINE_EVENTS registry shape", () => {
  it("is frozen at runtime", () => {
    expect(Object.isFrozen(TIMELINE_EVENTS)).toBe(true);
  });

  it("has 8 seed entries (student × 4, employee × 3, note × 1)", () => {
    expect(KIND_KEYS).toHaveLength(8);
  });

  it("every kind matches kebab-case <subject>.<verb> regex", () => {
    for (const kind of KIND_KEYS) {
      expect(kind).toMatch(KEBAB_CASE_KIND);
    }
  });

  it("every entry's payloadSchema is a Zod schema (parse is callable)", () => {
    for (const kind of KIND_KEYS) {
      const entry = TIMELINE_EVENTS[kind];
      expect(typeof entry.payloadSchema.parse).toBe("function");
    }
  });

  it("every entry's defaultVisibility is a valid TimelineVisibility enum member", () => {
    for (const kind of KIND_KEYS) {
      const entry = TIMELINE_EVENTS[kind];
      expect(VISIBILITY_VALUES.has(entry.defaultVisibility)).toBe(true);
    }
  });

  it("note.added carries the '*' polymorphic-subject sentinel (load-bearing for emit branching)", () => {
    expect(TIMELINE_EVENTS["note.added"].subjectKind).toBe("*");
  });

  it("note.added payloadSchema rejects empty text (min-1 constraint exercised)", () => {
    expect(() =>
      TIMELINE_EVENTS["note.added"].payloadSchema.parse({ text: "" }),
    ).toThrow();
  });
});

describe("RESOURCE_TO_SOFT_DELETE_KIND bridge map shape", () => {
  it("is frozen at runtime", () => {
    expect(Object.isFrozen(RESOURCE_TO_SOFT_DELETE_KIND)).toBe(true);
  });

  it("every mapped kind exists in TIMELINE_EVENTS (no typos)", () => {
    for (const resourceMap of Object.values(RESOURCE_TO_SOFT_DELETE_KIND)) {
      for (const kind of Object.values(resourceMap)) {
        expect(TIMELINE_EVENTS).toHaveProperty(kind as string);
      }
    }
  });

  it("every mapped kind's subjectKind matches the bridge resource (no cross-resource leaks)", () => {
    for (const [resource, resourceMap] of Object.entries(
      RESOURCE_TO_SOFT_DELETE_KIND,
    )) {
      for (const kind of Object.values(resourceMap)) {
        const entry = TIMELINE_EVENTS[kind as TimelineEventKind];
        expect(entry.subjectKind).toBe(resource);
      }
    }
  });
});
