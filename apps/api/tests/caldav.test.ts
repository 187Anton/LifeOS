import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarEventResponse } from "@lifeos/contracts";

import { CalDavError } from "../src/modules/caldav/errors.js";
import {
  parseCalendarEvent,
  serializeCalendarEvent,
} from "../src/modules/caldav/icalendar.js";
import { parseDavXml } from "../src/modules/caldav/xml.js";

test("erhält Zeitzone, Wiederholung und Erinnerungen im iCalendar-Roundtrip", () => {
  const event: CalendarEventResponse = {
    uid: "synthetic-timed@lifeos.local",
    title: "Vorlesung, Test",
    description: "Zeile 1\nZeile 2",
    location: "Raum; 1",
    isAllDay: false,
    startsAt: "2032-03-10T08:00:00.000Z",
    endsAt: "2032-03-10T09:30:00.000Z",
    startDate: null,
    endDate: null,
    timezone: "Europe/Berlin",
    recurrenceRule: "FREQ=WEEKLY;COUNT=4",
    reminderMinutes: [10, 30],
    etag: '"synthetic-etag"',
    sequence: 2,
    updatedAt: "2032-03-01T10:00:00.000Z",
  };

  const serialized = serializeCalendarEvent(event);
  assert.match(serialized, /BEGIN:VTIMEZONE\r\n/);
  assert.match(serialized, /TZID:Europe\/Berlin\r\n/);
  assert.match(serialized, /DTSTART;TZID=Europe\/Berlin:20320310T090000\r\n/);
  assert.match(serialized, /RRULE:FREQ=WEEKLY;COUNT=4\r\n/);
  assert.match(serialized, /TRIGGER:-PT10M\r\n/);
  assert.doesNotMatch(serialized.replaceAll("\r\n", ""), /\n/);

  const parsed = parseCalendarEvent(serialized, "UTC");
  assert.equal(parsed.uid, event.uid);
  assert.equal(parsed.timezone, "Europe/Berlin");
  assert.equal(parsed.isAllDay, false);
  if (parsed.isAllDay) assert.fail("Zeitgebundenes Ereignis erwartet");
  assert.equal(parsed.startsAt, event.startsAt);
  assert.equal(parsed.endsAt, event.endsAt);
  assert.equal(parsed.recurrenceRule, event.recurrenceRule);
  assert.deepEqual(parsed.reminderMinutes, [10, 30]);
});

test("erhält exklusive Datumsgrenzen eines ganztägigen Ereignisses", () => {
  const parsed = parseCalendarEvent(
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "X-WR-TIMEZONE:Europe/Berlin",
      "BEGIN:VEVENT",
      "UID:synthetic-all-day@lifeos.local",
      "SUMMARY:Prüfungstag",
      "DTSTART;VALUE=DATE:20320402",
      "DTEND;VALUE=DATE:20320403",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
    "UTC",
  );
  assert.equal(parsed.isAllDay, true);
  if (!parsed.isAllDay) assert.fail("Ganztägiges Ereignis erwartet");
  assert.equal(parsed.startDate, "2032-04-02");
  assert.equal(parsed.endDate, "2032-04-03");
  assert.equal(parsed.timezone, "Europe/Berlin");
});

test("liest DAV-Properties namespaceunabhängig und lehnt DTDs ab", () => {
  const parsed = parseDavXml(
    `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop></d:propfind>`,
  );
  assert.equal(parsed.root, "propfind");
  assert.deepEqual([...parsed.properties], ["getetag", "calendar-data"]);
  const query = parseDavXml(
    `<c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav"><c:filter><c:comp-filter name="VEVENT"><c:time-range start="20320301T000000Z" end="20320401T000000Z"/></c:comp-filter></c:filter></c:calendar-query>`,
  );
  assert.deepEqual(query.timeRange, {
    start: "20320301T000000Z",
    end: "20320401T000000Z",
  });
  assert.throws(
    () => parseDavXml(`<!DOCTYPE x [<!ENTITY y "z">]><x>&y;</x>`),
    CalDavError,
  );
});
