# Component architecture audit

This document records the current component boundaries, verified duplication,
and the order in which the UI should be consolidated. Visual behavior is
defined by `UI_AUDIT.md`; refactors must preserve that contract.

## Architecture map

| Layer | Components | Responsibility |
| --- | --- | --- |
| Application composition | `App.vue` | Session bootstrap, route composition, feature orchestration and global overlays |
| Feature panels | `DevicesPanel`, `UsersPanel`, `ProfilesPanel` | Collection-specific state and interaction composition |
| Feature components | `DeviceAuthDialog`, `UserForm`, `ProfileListItem`, `UsageDisplay`, `UsageResetWidget` | One domain workflow or presentational unit |
| Collection primitives | `UICollectionView`, `UICollectionItem`, `UIActionItem`, `UIDisclosureItem`, `UICollectionItemIdentity` | Shared list shell, item structure, behavior and optically aligned identity geometry |
| UI primitives | `UIButton`, `UIIconButton`, `UIDialog`, `UIPopover`, `UISelect`, `UISearchField`, `UISwitch`, `UITooltip`, `UIToastRegion`, `UICopyField` | Domain-independent controls with typed props/events |
| Composables | `useSession`, `useDevices`, `useProfiles`, `useEventStream`, etc. | Stateful behavior and side effects with explicit actions |

## Findings and decisions

### P0 — completed and guarded by tests

- Collection shell duplication was removed. Toolbar width/gap, list border,
  heading and empty state now belong to `UICollectionView`.
- Status/text geometry was removed from feature panels. `UICollectionItemIdentity`
  provides the Devices/Users baseline and an optically corrected disclosure
  variant for the inset Lucide chevron path.
- The global `polish.css` override layer was removed. Shared geometry now has a
  real owner instead of relying on `!important` selectors.
- Existing disclosure semantics remain native button behavior with
  `aria-expanded` and `aria-controls`.

### P1 — next changes

1. Completed: `ProfilesPanel.vue` was split into:
   - `ProfilesPanel`: search/filter and expanded-profile coordination;
   - `ProfileListItem`: row actions and disclosure markup;
   - `useProfileDisclosureAnimation`: Web Animations lifecycle;
   - `usePendingPlanShimmer`: delayed plan-placeholder lifecycle.
   Contracts stay props-down/events-up; the child must not call the API.
2. In progress: reduce `App.vue` to application composition:
   - completed: Users request/mutation state moved into `useUsers`;
   - move profile/device command notification wrappers into feature actions;
   - keep session bootstrap, routing and global overlay composition in `App`.
3. Completed: focused tests cover `UICollectionView`, `UICollectionItem`,
   `UICollectionItemIdentity`, `UIActionItem` and `UIDisclosureItem`, including
   disclosure semantics and empty state. E2E geometry remains the visual contract.

### P2 — consolidate after P1 boundaries stabilize

1. Completed: the duplicated one-minute clock in `UsageDisplay` and
   `UsageResetWidget` now uses `useMinuteClock`, which starts on mount, cleans
   up on unmount, and exposes readonly time.
2. Design `useTooltipTrigger` for the shared pointer/focus/Escape lifecycle in
   `UIIconButton`, `UISwitch` and `UICopyField`. Do not merge until the API can
   express their different dismiss and copied-state rules without flags that
   recreate the components inside a composable.
3. Replace remaining element selectors in scoped component CSS with explicit
   classes when touching those components. This improves ownership and avoids
   structural coupling.
4. Add accessibility checks for dialog focus restoration, disclosure keyboard
   activation, switch naming, and custom select keyboard navigation.

### Not recommended

- Do not create a universal row component that owns business actions. Devices,
  Users and Profiles have materially different columns and interactions.
- Do not introduce a global store solely to reduce prop passing; current shared
  state does not cross enough unrelated branches to justify it.
- Do not combine `UIButton` and `UIIconButton`; their accessible naming,
  tooltip and motion contracts are intentionally different.
- Do not abstract one-off feature markup before `ProfilesPanel` and `App` are
  split at their actual responsibility boundaries.

## Naming contract

Names describe responsibility, not current appearance or implementation:

- domain-independent primitives use `UI` plus a noun: `UIButton`, `UIDialog`;
- a semantic variant precedes that noun: `UIIconButton`, `UIActionItem`,
  `UIDisclosureItem`;
- a tightly scoped structural part carries its owner: `UICollectionItemIdentity`;
- feature components use domain plus role: `ProfileListItem`, `UserForm`,
  `DeviceAuthDialog`;
- stateful reusable behavior uses `use` plus capability: `useMinuteClock`,
  `useCollapseAnimation`.

An `Item` belongs to a collection. `UIActionItem` makes the whole item invoke
an action; `UIDisclosureItem` is the specialization whose action controls a
related expandable region. A `Widget` is a standalone compound control, so
`UsageResetWidget` stays separate. Do not introduce `UIDisclosureWidget` until
at least two domain-independent widgets share a concrete API.

Audit decisions:

- renamed `UIItemAction` to `UIActionItem`: the old name implied a small action
  located inside an item rather than behavior applied to the whole item;
- renamed `UIListIdentity` to `UICollectionItemIdentity`: its optical columns
  are coupled to the collection-item contract, not to arbitrary lists;
- renamed `DeviceAuthCard` to `DeviceAuthDialog`: it owns a modal workflow and
  renders `UIDialog`; it is not a card;
- retained `DevicesPanel`, `ProfilesPanel` and `UsersPanel`: they are application
  panel contents selected by routing, not generic route-shell views;
- retained `UsageDisplay` and `UsageResetWidget`: the first is presentational,
  while the second owns disclosure, selection and confirmation behavior.

## Verification gates

- `npm test`
- `npm run build`
- `npm run test:e2e`
- `git diff --check`
- Visual comparison of collection rows on desktop and coarse-pointer viewport
- No new `!important`, untyped emits, or domain API calls in `ui/`

## External references

- Vue props and one-way data flow: https://vuejs.org/guide/components/props
- Vue slots and named composition: https://vuejs.org/guide/components/slots
- Vue strongly recommended component naming rules:
  https://vuejs.org/style-guide/rules-strongly-recommended.html
- WAI-ARIA disclosure pattern:
  https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
- WAI accessible names and descriptions:
  https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/
