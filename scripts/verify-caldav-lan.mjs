import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";

const repositoryRoot = process.cwd();
const resourcesPath = path.join(
  repositoryRoot,
  "apps/desktop/src-tauri/resources",
);
const serverEntry = path.join(resourcesPath, "server/server.js");
const migrationsPath = path.join(resourcesPath, "sqlite-migrations");

const isPrivateIpv4 = (address) => {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  )
    return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};

const resolveLanHost = () => {
  const configured = process.env.LIFEOS_LAN_HOST?.trim();
  if (configured) {
    if (!isPrivateIpv4(configured)) {
      throw new Error(
        "LIFEOS_LAN_HOST muss eine private IPv4-Adresse aus dem lokalen Netz sein.",
      );
    }
    return configured;
  }

  const candidates = Object.entries(networkInterfaces())
    .flatMap(([name, addresses]) =>
      (addresses ?? []).map((address) => ({ name, ...address })),
    )
    .filter(
      (entry) =>
        entry.family === "IPv4" &&
        !entry.internal &&
        isPrivateIpv4(entry.address),
    )
    .sort((left, right) => {
      const rank = (name) => (name === "en0" ? 0 : name === "en1" ? 1 : 2);
      return rank(left.name) - rank(right.name);
    });
  if (!candidates[0]) {
    throw new Error(
      "Keine private IPv4-LAN-Adresse gefunden. Setze LIFEOS_LAN_HOST bewusst auf die lokale Rechneradresse.",
    );
  }
  return candidates[0].address;
};

const reservePort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
};

const waitForReady = async (baseUrl, child, output) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `Der LAN-Prüfserver endete vorzeitig (${child.exitCode}): ${output.join("")}`,
      );
    }
    try {
      if ((await fetch(`${baseUrl}/api/v1/readiness`)).status === 200) return;
    } catch {
      // Der ausschließlich temporäre Prüfserver startet noch.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Der LAN-Prüfserver wurde nicht bereit: ${output.join("")}`);
};

const stopServer = async (child, output) => {
  child.kill("SIGTERM");
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(
    exitCode,
    0,
    `Der LAN-Prüfserver wurde nicht geordnet beendet: ${output.join("")}`,
  );
};

const request = async (url, expectedStatus, options = {}) => {
  const response = await fetch(url, options);
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method ?? "GET"} ${url}`,
  );
  return response;
};

const testRoot = await mkdtemp(path.join(tmpdir(), "lifeos-caldav-lan-"));
const databasePath = path.join(testRoot, "data/lifeos.sqlite");
const storagePath = path.join(testRoot, "documents");
const lanHost = resolveLanHost();
const port = await reservePort();
const loopbackBaseUrl = `http://127.0.0.1:${port}`;
const lanBaseUrl = `http://${lanHost}:${port}`;
const output = [];
const child = spawn(process.execPath, [serverEntry], {
  cwd: resourcesPath,
  env: {
    NODE_ENV: "production",
    API_HOST: "0.0.0.0",
    API_PORT: String(port),
    DATABASE_URL: `file:${databasePath}`,
    WEB_ORIGIN: loopbackBaseUrl,
    SQLITE_MIGRATIONS_PATH: migrationsPath,
    STORAGE_PATH: storagePath,
    LOG_LEVEL: "error",
    SHUTDOWN_TIMEOUT_MS: "1000",
    SESSION_TTL_HOURS: "1",
    PATH: "/usr/bin:/bin",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => output.push(chunk.toString()));
child.stderr.on("data", (chunk) => output.push(chunk.toString()));

let running = true;
try {
  await waitForReady(loopbackBaseUrl, child, output);
  await request(`${lanBaseUrl}/api/v1/readiness`, 200);

  const localPassword = "synthetic-lan-app-password-2036";
  const calDavPassword = "synthetic-lan-caldav-password-2036";
  await request(`${loopbackBaseUrl}/api/v1/setup`, 201, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Synthetisches LAN-Profil",
      password: localPassword,
      calDavPassword,
      timezone: "Europe/Berlin",
    }),
  });

  const authorization = `Basic ${Buffer.from(`local:${calDavPassword}`).toString("base64")}`;
  const davHeaders = { authorization, depth: "0" };
  const discovery = await request(`${lanBaseUrl}/.well-known/caldav`, 301, {
    redirect: "manual",
  });
  assert.equal(discovery.headers.get("location"), "/caldav/");
  assert.equal(
    (
      await request(`${lanBaseUrl}/caldav/`, 401, {
        method: "PROPFIND",
      })
    ).headers.get("www-authenticate"),
    'Basic realm="LifeOS CalDAV", charset="UTF-8"',
  );

  const principal = await request(
    `${lanBaseUrl}/caldav/principals/local/`,
    207,
    {
      method: "PROPFIND",
      headers: { ...davHeaders, "content-type": "application/xml" },
      body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/><d:principal-URL/></d:prop></d:propfind>`,
    },
  );
  assert.match(await principal.text(), /\/caldav\/calendars\/local\//);
  const home = await request(`${lanBaseUrl}/caldav/calendars/local/`, 207, {
    method: "PROPFIND",
    headers: {
      authorization,
      depth: "1",
      "content-type": "application/xml",
    },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>`,
  });
  assert.match(await home.text(), /\/caldav\/calendars\/local\/personal\//);

  const suffix = randomUUID();
  const calendarUrl = `${lanBaseUrl}/caldav/calendars/local/personal/`;
  const timedUid = `lan-timed-${suffix}@lifeos.local`;
  const timedUrl = `${calendarUrl}${encodeURIComponent(timedUid)}.ics`;
  const timedIcs = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "X-WR-TIMEZONE:Europe/Berlin",
    "BEGIN:VEVENT",
    `UID:${timedUid}`,
    "SUMMARY:Synthetischer LAN-Termin",
    "DTSTART;TZID=Europe/Berlin:20361015T090000",
    "DTEND;TZID=Europe/Berlin:20361015T100000",
    "RRULE:FREQ=WEEKLY;COUNT=2",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT15M",
    "DESCRIPTION:Synthetische Erinnerung",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const created = await request(timedUrl, 201, {
    method: "PUT",
    headers: {
      authorization,
      "if-none-match": "*",
      "content-type": "text/calendar",
    },
    body: timedIcs,
  });
  const firstEtag = created.headers.get("etag");
  assert.match(firstEtag ?? "", /^"[0-9a-f-]+"$/);
  await request(timedUrl, 412, {
    method: "PUT",
    headers: {
      authorization,
      "if-none-match": "*",
      "content-type": "text/calendar",
    },
    body: timedIcs,
  });

  const fetched = await request(timedUrl, 200, { headers: { authorization } });
  assert.equal(fetched.headers.get("etag"), firstEtag);
  const fetchedIcs = await fetched.text();
  assert.match(fetchedIcs, new RegExp(`UID:${timedUid}`));
  assert.match(fetchedIcs, /BEGIN:VTIMEZONE/);
  assert.match(fetchedIcs, /DTSTART;TZID=Europe\/Berlin:20361015T090000/);
  assert.match(fetchedIcs, /RRULE:FREQ=WEEKLY;COUNT=2/);

  const updated = await request(timedUrl, 204, {
    method: "PUT",
    headers: {
      authorization,
      "if-match": firstEtag,
      "content-type": "text/calendar",
    },
    body: timedIcs.replace(
      "Synthetischer LAN-Termin",
      "Aktualisierter synthetischer LAN-Termin",
    ),
  });
  const secondEtag = updated.headers.get("etag");
  assert.ok(secondEtag && secondEtag !== firstEtag);
  await request(timedUrl, 412, {
    method: "DELETE",
    headers: { authorization, "if-match": firstEtag },
  });

  const query = await request(calendarUrl, 207, {
    method: "REPORT",
    headers: {
      authorization,
      depth: "1",
      "content-type": "application/xml",
    },
    body: `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="20361001T000000Z" end="20361101T000000Z"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
  });
  const queryBody = await query.text();
  assert.equal(queryBody.split(`UID:${timedUid}`).length - 1, 1);

  const allDayUid = `lan-all-day-${suffix}@lifeos.local`;
  const allDayUrl = `${calendarUrl}${encodeURIComponent(allDayUid)}.ics`;
  const allDayCreated = await request(allDayUrl, 201, {
    method: "PUT",
    headers: {
      authorization,
      "if-none-match": "*",
      "content-type": "text/calendar",
    },
    body: [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `UID:${allDayUid}`,
      "SUMMARY:Synthetischer LAN-Ganztag",
      "DTSTART;VALUE=DATE:20361016",
      "DTEND;VALUE=DATE:20361017",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
  });
  const allDayEtag = allDayCreated.headers.get("etag");
  assert.match(allDayEtag ?? "", /^"[0-9a-f-]+"$/);
  const allDayBody = await (
    await request(allDayUrl, 200, { headers: { authorization } })
  ).text();
  assert.match(allDayBody, new RegExp(`UID:${allDayUid}`));
  assert.match(allDayBody, /DTSTART;VALUE=DATE:20361016/);
  assert.match(allDayBody, /DTEND;VALUE=DATE:20361017/);

  await request(timedUrl, 204, {
    method: "DELETE",
    headers: { authorization, "if-match": secondEtag },
  });
  await request(timedUrl, 404, { headers: { authorization } });
  await request(allDayUrl, 204, {
    method: "DELETE",
    headers: { authorization, "if-match": allDayEtag },
  });

  /**
   * Paket 9: verwaltete Aufgabenabbildung über den gebauten Sidecar. Der
   * Nachweis prüft die Ereignisform, das vollständige PUT des gelesenen
   * Stands, die atomare Ablehnung nicht unterstützter Änderungen, die
   * Löschung über beide Wege und den unveränderten Rückweg zur Aufgabe.
   * Ein physischer Apple-Gerätetest ist damit nicht ersetzt.
   */
  const login = await request(`${loopbackBaseUrl}/api/v1/session`, 201, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: localPassword }),
  });
  const sessionCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const apiHeaders = {
    "content-type": "application/json",
    cookie: sessionCookie,
  };
  const taskResponse = await request(`${loopbackBaseUrl}/api/v1/tasks`, 201, {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({
      title: "Synthetische LAN-Aufgabe",
      dueDate: "2036-10-20",
      scheduledStartAt: "2036-10-19T08:00:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 45,
    }),
  });
  const task = await taskResponse.json();
  const dueUid = `${task.id}.frist@tasks.lifeos.local`;
  const dueUrl = `${calendarUrl}${encodeURIComponent(dueUid)}.ics`;
  const dueResponse = await request(dueUrl, 200, {
    headers: { authorization },
  });
  const dueBody = await dueResponse.text();
  assert.match(dueBody, /DTSTART;VALUE=DATE:20361020/);
  assert.match(dueBody, /DTEND;VALUE=DATE:20361021/);
  assert.match(dueBody, /SUMMARY:Frist: Synthetische LAN-Aufgabe/);

  // Das vollständige PUT des unverändert gelesenen Stands wird angenommen.
  const acceptedPut = await request(dueUrl, 204, {
    method: "PUT",
    headers: {
      authorization,
      "if-match": dueResponse.headers.get("etag"),
      "content-type": "text/calendar",
    },
    body: dueBody,
  });
  const acceptedEtag = acceptedPut.headers.get("etag");
  assert.ok(acceptedEtag);
  // Eine nicht unterstützte Änderung wird ohne Teiländerung abgelehnt.
  // Ohne bestätigten Stand wird gar nichts geschrieben (428).
  await request(dueUrl, 428, {
    method: "PUT",
    headers: { authorization, "content-type": "text/calendar" },
    body: dueBody.replace(
      "SUMMARY:Frist: Synthetische LAN-Aufgabe",
      "SUMMARY:Synthetischer LAN-Termin",
    ),
  });
  await request(dueUrl, 409, {
    method: "PUT",
    headers: {
      authorization,
      "if-match": acceptedEtag,
      "content-type": "text/calendar",
    },
    body: dueBody.replace(
      "SUMMARY:Frist: Synthetische LAN-Aufgabe",
      "SUMMARY:Synthetischer LAN-Termin",
    ),
  });
  const unchangedTask = await (
    await request(`${loopbackBaseUrl}/api/v1/tasks/${task.id}`, 200, {
      headers: apiHeaders,
    })
  ).json();
  assert.equal(unchangedTask.title, "Synthetische LAN-Aufgabe");
  assert.equal(unchangedTask.dueDate, "2036-10-20");
  assert.equal(unchangedTask.estimatedDurationMinutes, 45);
  const dueAfter = await request(dueUrl, 200, { headers: { authorization } });
  assert.match(
    await dueAfter.text(),
    /SUMMARY:Frist: Synthetische LAN-Aufgabe/,
  );

  // Der geplante Arbeitsblock entsteht mit geschätzter Dauer und eigener UID.
  const blockUid = `${task.id}.zeitblock@tasks.lifeos.local`;
  const blockUrl = `${calendarUrl}${encodeURIComponent(blockUid)}.ics`;
  const blockBody = await (
    await request(blockUrl, 200, { headers: { authorization } })
  ).text();
  assert.match(blockBody, /DTSTART;TZID=Europe\/Berlin:20361019T100000/);
  assert.match(blockBody, /DTEND;TZID=Europe\/Berlin:20361019T104500/);

  /**
   * Paket 9: Ohne geschätzte Dauer bleibt der geplante Start als sichtbare
   * Startmarkierung stehen – als `DTSTART` ohne `DTEND` und ohne `DURATION`.
   * Es wird weder ein Ende noch eine Dauer erfunden.
   */
  await request(`${loopbackBaseUrl}/api/v1/tasks/${task.id}`, 200, {
    method: "PATCH",
    headers: apiHeaders,
    body: JSON.stringify({ estimatedDurationMinutes: null }),
  });
  const markerResponse = await request(blockUrl, 200, {
    headers: { authorization },
  });
  const markerBody = await markerResponse.text();
  assert.match(markerBody, new RegExp(`UID:${blockUid}`));
  assert.match(markerBody, /DTSTART;TZID=Europe\/Berlin:20361019T100000/);
  assert.doesNotMatch(markerBody, /DTEND/);
  assert.doesNotMatch(markerBody, /DURATION/);
  const strippedTask = await (
    await request(`${loopbackBaseUrl}/api/v1/tasks/${task.id}`, 200, {
      headers: apiHeaders,
    })
  ).json();
  assert.equal(strippedTask.scheduledStartAt, "2036-10-19T08:00:00.000Z");
  assert.equal(strippedTask.estimatedDurationMinutes, null);

  /**
   * Apple verlängert den Block: das vollständige PUT mit `DTEND` ergänzt die
   * Dauer in der Aufgabe; die stabile UID bleibt erhalten.
   */
  await request(blockUrl, 204, {
    method: "PUT",
    headers: {
      authorization,
      "if-match": markerResponse.headers.get("etag"),
      "content-type": "text/calendar",
    },
    body: markerBody.replace(
      "DTSTART;TZID=Europe/Berlin:20361019T100000",
      "DTSTART;TZID=Europe/Berlin:20361019T100000\r\nDTEND;TZID=Europe/Berlin:20361019T113000",
    ),
  });
  const extendedBody = await (
    await request(blockUrl, 200, { headers: { authorization } })
  ).text();
  assert.match(extendedBody, /DTEND;TZID=Europe\/Berlin:20361019T113000/);
  const extendedTask = await (
    await request(`${loopbackBaseUrl}/api/v1/tasks/${task.id}`, 200, {
      headers: apiHeaders,
    })
  ).json();
  assert.equal(extendedTask.estimatedDurationMinutes, 90);

  /**
   * Ein PUT ohne `DTEND`, aber mit `DURATION:PT0S`, bleibt ungültig: eine
   * Dauer von null wird nicht als Ende erfunden.
   */
  await request(blockUrl, 400, {
    method: "PUT",
    headers: {
      authorization,
      "if-match": (
        await request(blockUrl, 200, { headers: { authorization } })
      ).headers.get("etag"),
      "content-type": "text/calendar",
    },
    body: extendedBody.replace(
      "DTEND;TZID=Europe/Berlin:20361019T113000",
      "DURATION:PT0S",
    ),
  });
  assert.match(
    await (await request(blockUrl, 200, { headers: { authorization } })).text(),
    /DTEND;TZID=Europe\/Berlin:20361019T113000/,
  );

  // Löschung über CalDAV entfernt die verwaltete Abbildung und gibt die
  // Aufgabenfelder frei; die Frist bleibt bestehen.
  const blockEtag = (
    await request(blockUrl, 200, { headers: { authorization } })
  ).headers.get("etag");
  await request(blockUrl, 204, {
    method: "DELETE",
    headers: { authorization, "if-match": blockEtag },
  });
  const releasedTask = await (
    await request(`${loopbackBaseUrl}/api/v1/tasks/${task.id}`, 200, {
      headers: apiHeaders,
    })
  ).json();
  assert.equal(releasedTask.scheduledStartAt, null);
  assert.equal(releasedTask.estimatedDurationMinutes, null);
  assert.equal(releasedTask.dueDate, "2036-10-20");
  await request(blockUrl, 404, { headers: { authorization } });

  // Das Löschen der Aufgabe entfernt die verwaltete Frist.
  await request(`${loopbackBaseUrl}/api/v1/tasks/${task.id}`, 204, {
    method: "DELETE",
    headers: apiHeaders,
  });
  await request(dueUrl, 404, { headers: { authorization } });

  await stopServer(child, output);
  running = false;
  console.info(
    `CalDAV-LAN-Vorprüfung über ${lanHost} bestand Discovery, CRUD, stabile UID, ETag-Konflikt, Ganztag, Zeitzone, Wiederholung, Duplikatschutz und die verwaltete Aufgabenabbildung samt gezielter Startmarkierung ohne Ende. Ein physischer Apple-Kalender-Test ist damit nicht ersetzt.`,
  );
} finally {
  if (running && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  await rm(testRoot, { recursive: true, force: true });
}
