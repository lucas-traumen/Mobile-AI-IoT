# Current Task Plan — `mdns-link-local-address-filter`

Status: APPROVED (2026-09-30) — user explicitly chose the COMPLETE
implementation over the deferred-subnet proposal: "tôi nghĩ đừng hoãn triển
khai hoàn chỉnh đi". Both former deviations are now IN scope: D-1 phone-
subnet priority tier (via `expo-network`) and D-2 Android DNSSD impl switch.

## Task ID

`mdns-link-local-address-filter`

## Parent milestone

M17 `settings-mdns-discovery` follow-up / M3 post-V1 hardening. The user's
M17 brief omitted `fe80::/10` from the filter list (IPv4-only list: 127/8,
169.254/16, 172.16/12, 100.64/10 — user-acknowledged spec gap, their side).

## Goal

Never autofill an unreachable address from mDNS discovery: filter IPv6
link-local/loopback (plus the existing IPv4 private ranges) at the
address-selection point, prefer the IPv4 on the phone's own subnet, and make
Android actually receive the FULL advertised address list so the Wi-Fi IPv4
(`196.169.4.166`) is selected — filling BOTH the MQTT host and the Influx
URL (they share one source: `DiscoveredServer.host`).

## Why — verified root cause (orchestrator, 2026-09-30, read-only)

1. `pickHost` (`mdnsDiscoveryService.ts:138-156`) filters IPv4-only ranges
   (`isUnreachableFromLan`: 127/8, 169.254/16, 172.16/12, 100.64/10) and has
   ZERO IPv6 knowledge. When `addresses` contains no IPv4 it falls back to
   `service.host` VERBATIM.
2. On Android the lib defaults to the NSD impl (`scan()` 4th arg default
   `ImplType.NSD`). `NsdServiceImpl.serviceInfoToMap` (lib source, verified)
   emits EXACTLY ONE address — `NsdServiceInfo.getHost().getHostAddress()` —
   and sets `host` to the reverse-DNS name of that same single address. For a
   link-local IPv6 with no PTR record, `getHostName()` returns the literal
   itself. So when Android NSD surfaces the fe80:: address (avahi advertises
   6× fe80:: + 4× docker 172.17-20.0.1 + 127.0.0.1 + the single Wi-Fi IPv4):
   `addresses=[fe80::…]` → `ipv4s=[]` → hostname fallback returns
   `"fe80::…"` → `applyDiscoveredService` fills `mqtt.host` AND
   `influx.url` with it. Both connection checks fail; the server log stays
   silent because `fe80::/10` without a zone-id never leaves the phone.
3. The previous task (`influx-ipv6-url-normalization`, smoke verified) made
   the URL well-formed — hence today's honest "Không kết nối được tới máy
   chủ" instead of a validation error. The address itself is still garbage.
4. Consequence: a filter ALONE is necessary but NOT sufficient. When NSD
   hands the app only the fe80:: address, the correctly-filtered result is
   honestly empty — the expected autofill of `196.169.4.166` cannot happen
   because the IPv4 never reaches JS. The full address list must arrive
   first (D-2).

## Current state (verified 2026-09-30)

- `mdnsDiscoveryService.ts` is clean vs HEAD (indexed by GitNexus); the
  surrounding settings files carry uncommitted layers from prior tasks
  (attribution by content is the established practice).
- `@types/react-native-zeroconf@0.13.1` exports `ImplType` and types both
  `scan(type, protocol, domain, implType?)` and `stop(implType?)`.
- The lib's `DnssdImpl` (embedded dnssd resolver) emits ALL resolved
  A/AAAA addresses in `addresses` (loop over `getInetAddresses()`), acquires
  its own multicast lock, and is compiled into the same lib package the
  installed APK already contains → switching impls is a JS-only change.
- The existing `patches/react-native-zeroconf+0.14.0.patch` touches only
  `NsdServiceImpl.stop()` (multicast-lock crash hardening); it does not
  affect impl selection and must be preserved byte-exact.
- `ServerDiscoveryStep` already renders the honest 'none' state
  ("không tìm thấy") with `Thử lại` + `Nhập tay địa chỉ` — the brief's
  "Không còn gì → báo không tìm thấy" maps onto it with no UI change.
- `expo-network` is NOT installed. It is the only first-party way to learn
  the phone's IPv4 in JS (`getIpAddressAsync()`); it has native code (Expo
  autolinking picks it up at the gradle build) → user smoke requires a
  NATIVE REBUILD, not just Metro reload. It exposes NO subnet mask → the
  subnet tier uses an octet-prefix heuristic (disclosed below).
- GitNexus preflight (orchestrator): `mapResolvedService` LOW — 0 external
  callers (only the internal `onResolved` handler). `MdnsDiscoveryService`
  LOW — 3 direct consumers (`getMdnsDiscoveryService`, AdvancedSettingsScreen
  import, ServerDiscoveryStep import), 1 process (`Discovery →
  MdnsDiscoveryService`), fully contained in the settings module.

## Target state

0. Dependency: run `npx expo install expo-network` inside `app-mobile/`
   (pins the SDK-57-compatible version). Expected churn: `package.json` +
   `package-lock.json`. `android/` stays gitignored prebuild output; no
   config-plugin entry is needed for expo-network. NOTE for the user gate:
   the DEVICE smoke for this task requires a native rebuild (Metro reload is
   NOT enough this time — new native module).
1. Phone-IP seam (service-owned, screen untouched): add an optional
   constructor-injected provider to `MdnsDiscoveryService`:

   ```ts
   constructor(
     logger: Logger = createLogger('MdnsDiscovery'),
     phoneIpProvider: () => Promise<string | null> = defaultPhoneIpProvider,
   )
   ```

   - Default provider: web guard (`Platform.OS === 'web'` → resolves
     `null` without touching the native module — the service's web
     transport guard fires before the provider anyway); otherwise
     `getIpAddressAsync()` from `expo-network`, `try/catch` → `null`,
     sanitized with the existing `isIpv4` check (garbage/IPv6/cellular
     oddities → `null`).
   - The provider is invoked EXACTLY ONCE per scan, BEFORE attaching the
     `resolved`/`error` handlers and BEFORE `client.scan(...)` — every
     `resolved` event then maps against a settled `phoneIp: string | null`.
     Async-init safety: if `session.stop()` lands while the provider promise
     is pending, the existing `finished` guard must fire
     `onDone(ok([]))` exactly once, never attach handlers, and never start
     the native scan. The 10 s window starts at native scan start.
   - `getMdnsDiscoveryService()` singleton construction is unchanged (the
     default provider is the second optional arg); the screen/wiring layers
     and the `MdnsDiscoveryServiceLike` seam are UNTOUCHED.
2. Address selection — rewrite the private `pickHost` in
   `mdnsDiscoveryService.ts` (selection stays module-private; single
   consumer, no `@core/net` extraction — YAGNI, revisit when a second
   consumer appears). Signature becomes
   `pickHost(service: Service, phoneIp: string | null): string | null`:
   - FILTER (never selected):
     - IPv6 link-local `fe80::/10` (first hextet 0xfe80–0xfebf);
     - IPv6 loopback `::1`;
     - IPv4 loopback `127/8`; IPv4 link-local `169.254/16`; Docker
       `172.16/12`; Tailscale CGNAT `100.64/10` (existing behavior);
     - a trailing zone-id (`fe80::1%wlan0`) is stripped BEFORE
       classification (tolerant; NSD never emits one, DNSSD might);
     - v4-mapped `::ffff:a.b.c.d` unwraps to its IPv4 and follows the IPv4
       filters;
     - all other non-global IPv6 (ULA `fc00::/7`, multicast, etc.) is never
       selected by the priority tiers below.
   - PRIORITY (the user brief's tier list, complete):
     1. IPv4 on the phone's subnet: among surviving IPv4s, rank by the
        number of shared LEADING octets with the phone IPv4 (0–4); highest
        rank wins; rank ties keep advertisement order. A /24 match (3
        octets) is the expected real-world case. Phone IP `null`/invalid →
        every rank is 0 → this tier degrades to tier 2 unchanged. The
        ranking must NOT rely on engine sort stability: map candidates to
        `{ip, index, score}`, sort by `score DESC, index ASC`, map back.
        (Honesty note, also for the README: Android/JS exposes no subnet
        mask, so "same subnet" is this octet-prefix heuristic, not a true
        mask compare.)
     2. any other surviving IPv4 (rank 0 — subsumed by the same ranked
        pass);
     3. first surviving IPv6 global-unicast (`2000::/3` — the brief's
        "2xxx" global class, explicitly excluding fe80);
     4. nothing → `mapResolvedService` returns `null` → the advertisement is
        SKIPPED → the scan's honest empty result drives the existing
        "không tìm thấy" UI.
   - REMOVE the `service.host` hostname fallback (brief: "Không còn gì → báo
     không tìm thấy"): on NSD it is the fe80:: leak path; on DNSSD it is the
     service NAME (upstream quirk — `DnssdImpl` puts `getServiceName()` into
     the host field); `.local` names are not resolvable by RN sockets
     anyway. `pickHost` must not return any value that has not passed the
     filter. `mapResolvedService(service, phoneIp)` gains the second
     parameter (default `null` — it has zero external callers, so the
     signature change is contained).
3. Android full-list path (D-2): pass `ImplType.DNSSD` to BOTH
   `client.scan(...)` and `client.stop(...)` in `MdnsDiscoveryService`
   (stop MUST dispatch the same impl — the factory keys the stop to the impl
   string). Import `ImplType` from `react-native-zeroconf`. iOS is
   unaffected (the lib ignores `implType` there).
   - KNOWN RISK (device-gated): embedded-mDNS-responder reliability on the
     SM-A107F is unverified. If it proves flaky, the documented fallback is
     reverting the impl arg to NSD (the filter + subnet tier stay correct;
     manual entry and the M27b QR remain the escape hatches). A native patch
     to `NsdServiceImpl` using `getHostAddresses()` is NOT viable on this
     device (API 34+ only; the phone runs an older Android).
   - DNSSD may emit `resolved` MULTIPLE times per service (progressive
     address accumulation): the existing per-event mapping +
     `name|host|port` dedupe already handles it — an early fe80-only event
     is filtered to null; a later full-list event picks the IPv4. A rare
     transient partial list could produce an extra row; accepted (documented
     in README), not worth new machinery.
4. Contract doc accuracy (comment-only): `DiscoveredServer.host` JSDoc in
   `mdnsDiscoveryContract.ts` becomes "the LAN-reachable IPv4 closest to the
   phone's subnet, else any surviving IPv4, else a global IPv6 — filtered
   ranges (loopback/link-local/Docker/CGNAT/IPv6 link-local/loopback) are
   never selected; advertisements without a usable address are skipped".
5. Settings README: document the address-selection contract (filter list +
   subnet-priority heuristic + honest-empty semantics) and the Android DNSSD
   impl choice with its rationale.

## Scope

- `app-mobile/package.json` + `app-mobile/package-lock.json` (via
  `npx expo install expo-network`)
- `app-mobile/src/modules/settings/internal/services/mdnsDiscoveryService.ts`
- `app-mobile/src/modules/settings/internal/services/mdnsDiscoveryService.test.ts`
- `app-mobile/src/modules/settings/internal/domain/mdnsDiscoveryContract.ts`
  (JSDoc comment ONLY — the file carries prior-task uncommitted hunks;
  attribution by content)
- `app-mobile/src/modules/settings/README.md`

## Out of scope

- The M29b QR package: the frontend half (QR prefill influx url/org/bucket +
  keep-current + mqttPort) ALREADY LANDED as M27b
  (`credentials-qr-nonsecret-fields`, 2026-09-29); remaining M29 work is the
  server-side QR content. No frontend QR change here.
- Native patch to `NsdServiceImpl` (API 34+ only — dead on the SM-A107F).
- No changes to the completed MQTT/Influx normalization layers
  (`normalizeBrokerHost`, `formatHostForUrl`, `normalizeInfluxBaseUrl`), the
  settings schema, persistence, wizard navigation, UI states, BLE/boards,
  app.json plugin config, or the zeroconf patch file.
- No other new dependency besides `expo-network`.
- Preserve every unrelated uncommitted layer; no commit/push.

## Relevant files/modules/symbols

- `pickHost` (private) / `mapResolvedService` / `MdnsDiscoveryService.startScan`
  — all LOW upstream impact (see Current state).
- `applyDiscoveredService` — UNCHANGED (fills both fields from
  `service.host`; the fix is upstream of it).
- `ServerDiscoveryStep` / `AdvancedSettingsScreen` — UNCHANGED (the honest
  'none' state already exists; the provider is constructor-injected, not
  screen-injected).

## Architecture constraints

- Selection logic stays private to the settings discovery service (single
  consumer; core extraction deferred by YAGNI).
- Pure classification: regex/parse only, no `URL` constructor (established
  Hermes convention), no engine-sort-stability assumptions.
- The honest-empty scan (`ok([])`) stays DISTINCT from the typed error
  Result — filtering must never convert a found service into an error.
- `scan`/`stop` impl args MUST match; both dispatch through
  `ZeroConfImplFactory` keyed by the impl string.
- The existing zeroconf patch file stays byte-identical.
- Zod stays the validity authority; fill-never-save and secrets-unreachable
  contracts unchanged.
- Prettier runs from `app-mobile/`.

## Capability contract

- Classification: bug — root-cause fix in the discovery address selection +
  one first-party dependency; JS changes are Metro-reloadable but the new
  native module makes the USER SMOKE a native-rebuild gate.
- GitNexus: REQUIRED — coder repeats pre-edit impact on `mapResolvedService`
  and `MdnsDiscoveryService` before editing, then runs
  `detect_changes(all)` after implementation and attributes cumulative
  worktree noise (known CRITICAL union from preserved layers).
- Coder REQUIRED: `Implement Plan`, `gitnexus-impact-analysis`,
  `gitnexus-debugging`, `tdd`.
- Coder OPTIONAL: `codebase-design` (only if the selection seam needs
  reshaping beyond the plan), `gitnexus-cli` (only if refreshing the index;
  the task's edit targets are indexed at HEAD — net.ts/contract.ts
  uncommitted layers are NOT indexed and that is fine for this scope).
- DENY: auto-commit/push, subagents, workflow-owner skills, governance or
  memory edits, scope expansion, native/patch changes, extra dependencies
  beyond `expo-network`.

## Implementation steps

1. Inspect plan/state/git diff; isolate task-attributed hunks from the
   preserved worktree. Invoke REQUIRED skills; repeat and record pre-edit
   impacts (both LOW). Run `npx expo install expo-network` inside
   `app-mobile/`.
2. RED: add/update the service tests below; capture failure evidence
   (including the INVERTED legacy expectations: all-unreachable-IPv4 now
   skipped; hostname-only now skipped; scan now carries the DNSSD impl arg).
3. GREEN: add the provider seam (default + async pre-attach init); rewrite
   `pickHost` (classification + ranked tiers + fallback removal); switch
   `scan`/`stop` to `ImplType.DNSSD`; update the contract JSDoc.
4. Update the settings README contract section.
5. Verify from `app-mobile/`: focused `mdnsDiscoveryService` suite; full
   sequential Jest (`--runInBand`); `npm run typecheck`; `npm run lint`
   (0 errors / 4 documented baseline warnings); Prettier on touched files;
   `git diff --check`; GitNexus `detect_changes(all)`. No commit/push.

## Acceptance criteria

1. USER'S MANDATORY FIXTURE — mock resolve with
   `[fe80::a, 172.17.0.1, 127.0.0.1, 192.168.1.50]` selects
   `192.168.1.50` — verified BOTH with phone IP `192.168.1.10` injected
   (subnet rank path) and with phone IP `null` (only-survivor path).
2. Avahi-shaped mock `[fe80::…, 172.17.0.1..172.20.0.1, 127.0.0.1,
   196.169.4.166]` selects `196.169.4.166`, and the resulting
   `applyDiscoveredService` patch carries it into BOTH `mqtt.host` and the
   built `influx.url` (contract test; one source of truth).
3. Subnet tier: with phone IP `192.168.1.10` and surviving IPv4s
   `[10.0.0.2, 192.168.1.50]` the pick is `192.168.1.50` (advertisement
   order loses); rank ties (both `192.168.1.x`) keep advertisement order;
   provider rejection/garbage → `null` → advertisement order.
4. An advertisement whose every address is filtered (fe80-only, ::1-only,
   all-unreachable-IPv4, empty addresses + hostname-only) is SKIPPED → the
   scan completes `ok([])` → the existing 'none' UI; never an autofill,
   never a typed error.
5. Zone-id (`fe80::1%wlan0`) and v4-mapped (`::ffff:127.0.0.1`) forms are
   filtered.
6. A global IPv6 (e.g. `2a00:1450:4001:81b::200e`) is selected ONLY when no
   IPv4 survives, and the built Influx URL brackets it via the existing
   `formatHostForUrl` path.
7. Android scan dispatches the DNSSD impl and stop dispatches the SAME impl
   (asserted via the fake's recorded call args). Async-init contract:
   `stop()` during provider pending → `onDone` exactly once with `ok([])`,
   native scan never started.
8. All existing lifecycle/cleanup/web-guard/dedupe contracts hold; full
   verification passes; no commit/push.
9. USER DEVICE SMOKE (gates acceptance; NATIVE REBUILD required —
   `npm run android` or the ledger's offline gradlew workaround + `adb
   install -r`): "Tìm máy chủ trong mạng" autofills `196.169.4.166` into
   BOTH the MQTT host and the Influx URL → `Kiểm tra kết nối` reaches the
   server. The MQTT host field of an already-saved fe80 draft must be
   re-selected from discovery (or re-scanned QR) to be repaired — no silent
   rewrite of persisted settings.

## Required tests / verification

Focused `mdnsDiscoveryService.test.ts` additions/updates (fake zeroconf,
existing harness — tests construct the service with an injected provider;
the default expo-network provider is never invoked under Jest):

- the user's mandatory fixture (AC1, both provider variants) and the
  avahi-shaped fixture (AC2);
- subnet ranking: phone `192.168.1.10` + `[10.0.0.2, 192.168.1.50,
  fe80::a]` → `192.168.1.50`; rank-tie keeps order; provider
  rejects/returns garbage → `null` → advertisement order (AC3);
- fe80-only / ::1-only / `[127.0.0.1, 172.17.0.1]`-only / hostname-only →
  skipped → `ok([])` (AC4) — INVERTS the two legacy "keeps its first IPv4" /
  "falls back to the hostname" assertions;
- zone-id and v4-mapped filtering (AC5);
- global-IPv6 tier selection + contract test that the Influx URL is
  bracketed while `mqtt.host` stays bare (AC6, via
  `mdnsDiscoveryContract.test.ts` if cleaner there);
- `scanCalls` contains `['smarthome','tcp','local.','DNSSD']` and `stop`
  receives `'DNSSD'` (AC7) — extend the fake to record stop args AND export
  `ImplType` from the `jest.mock` factory (`{__esModule: true, default:
  FakeZeroconf, ImplType: {NSD: 'NSD', DNSSD: 'DNSSD'}}`) — otherwise the
  real `ImplType.DNSSD` import is `undefined` under the mock;
- `stop()` during provider pending (AC7): flush-free stop right after
  `startScan` → `onDone` once with `ok([])`, `fake.scanCalls` empty;
- existing suites (lifecycle, cleanup, web guard, timeout) pass with ONE
  mechanical adaptation: the provider promise must flush (a `await
  Promise.resolve()` tick, or `await act(async () => {})` where the harness
  is React) after `startScan` before emitting fake events / advancing
  timers — the native scan now starts after the provider settles.

If the module-scope `expo-network` import misbehaves under jest-expo, add
`jest.mock('expo-network', ...)` returning `{ getIpAddressAsync: async () =>
null }` — the injected fakes make the default unreachable either way.

Full gates per Implementation step 5.

## Risks / open questions

- D-2 device risk: embedded dnssd reliability on the SM-A107F is unproven —
  explicit device smoke gates acceptance; documented fallback = revert impl
  arg to NSD (filter + subnet tier remain correct; manual entry + QR
  remain).
- D-1 honesty note: no subnet-mask API exists in JS; the tier is an
  octet-prefix heuristic (disclosed in README + this plan). On the user's
  real network exactly one IPv4 survives the filter, so heuristic vs true
  mask are indistinguishable there.
- `getIpAddressAsync()` may return a cellular/invalid address (phone off
  Wi-Fi) → sanitize → `null` → tier degrades to advertisement order. mDNS
  itself needs Wi-Fi multicast, so this only affects ordering, never
  correctness.
- Hostname-fallback removal is a user-visible behavior change (inverts one
  pinned test): a `.local`-only advertisement now yields "không tìm thấy"
  instead of a probably-unreachable `.local` autofill. This follows the
  brief's explicit priority list.
- Rare DNSSD transient: a partial-list `resolved` event could surface an
  extra row before the full-list event replaces it in the map; accepted and
  documented.
- expo-network adds a native module: user smoke requires a native rebuild;
  if the build environment is unavailable, the JS layer is still testable
  and the rebuild can follow (the ledger's offline gradlew workaround is
  the precedent).
- GitNexus source content is stale for some uncommitted hunks (net.ts,
  contract.ts); filesystem source/diff is authoritative for exact content —
  the task's own edit targets are indexed at HEAD.

## User approval

- Status: approved.
- Notes: user rejected the subnet-tier deferral and asked for the complete
  implementation — "tôi nghĩ đừng hoãn triển khai hoàn chỉnh đi"
  (2026-09-30). D-1 (expo-network + subnet priority) and D-2 (DNSSD impl
  switch) are both approved as part of this task.
