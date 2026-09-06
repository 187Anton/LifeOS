import assert from "node:assert/strict";
import test from "node:test";

import {
  ExternalCalDavNetworkError,
  isBlockedExternalCalDavAddress,
  validateExternalCalDavUrl,
} from "../src/modules/external-caldav/client.js";

test("weist lokale, reservierte und IPv4-übersetzende CalDAV-Ziele zurück", () => {
  for (const address of [
    "127.0.0.1",
    "169.254.169.254",
    "192.168.1.20",
    "198.18.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "fe80::1",
  ]) {
    assert.equal(isBlockedExternalCalDavAddress(address), true, address);
  }
  assert.equal(isBlockedExternalCalDavAddress("93.184.216.34"), false);
  assert.equal(isBlockedExternalCalDavAddress("2606:2800:220:1::1"), false);
});

test("akzeptiert ausschließlich HTTPS-Ziele ohne Zugangsdaten oder lokale Namen", () => {
  assert.equal(
    validateExternalCalDavUrl("https://calendar.example.test/dav/").origin,
    "https://calendar.example.test",
  );
  for (const target of [
    "http://calendar.example.test/dav/",
    "https://name:password@calendar.example.test/dav/",
    "https://localhost/dav/",
    "https://service.local/dav/",
    "https://127.0.0.1/dav/",
    "https://[64:ff9b::7f00:1]/dav/",
  ]) {
    assert.throws(
      () => validateExternalCalDavUrl(target),
      (error: unknown) => error instanceof ExternalCalDavNetworkError,
      target,
    );
  }
});
