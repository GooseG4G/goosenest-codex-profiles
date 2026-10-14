# UI interaction map

This document is the working contract for the control panel UI. Components may change visually, but the interaction invariants below must remain consistent.

## Foundations

| Primitive      | Context                                    | Rest                                      | Hover                                           | Focus                                  | Pressed                          | Disabled / busy                       |
| -------------- | ------------------------------------------ | ----------------------------------------- | ----------------------------------------------- | -------------------------------------- | -------------------------------- | ------------------------------------- |
| `UIButton`     | Text actions in forms and dialogs          | Neutral or primary surface                | Surface brightens, icon and label move together | Visible 2 px focus ring                | Surface compresses by 1 px       | No motion; busy cursor and spinner    |
| `UIIconButton` | Toolbar and row actions                    | Transparent in rows, bordered in toolbars | Shared soft surface; icon-specific motion       | Same focus ring; tooltip visible       | Short scale/translation feedback | Muted icon; no tooltip or motion      |
| `UITooltip`    | Unlabelled icon actions                    | Hidden                                    | Opens after a short delay                       | Opens immediately for keyboard focus   | Closes on action                 | Never shown for disabled controls     |
| `UIDialog`     | Destructive confirmation and focused forms | Modal surface over dim layer              | N/A                                             | Focus enters dialog and is trapped     | Buttons keep their own feedback  | Escape/backdrop blocked while pending |
| `UIPopover`    | Lightweight contextual actions             | Anchored to trigger                       | Does not change page layout                     | Arrow-key navigation when menu-like    | Closes after selection           | Trigger communicates disabled state   |
| `UIField`      | Login and edit/create forms                | Label, control, optional hint             | Border increases contrast                       | Focus border and optional error clears | N/A                              | Muted surface                         |
| `UISearchField` | Collection filtering                      | One icon/input surface                    | Outer border increases contrast                  | Ring belongs to the complete search surface | N/A                           | Entire surface is muted               |

## Navigation

- Desktop navigation is a compact vertical list, not a stack of cards.
- The selected tab has a persistent neutral fill and stronger text/icon contrast.
- Hover is weaker than selected; pressed is visibly distinct from both.
- Icon and label form one hit target with a minimum height of 36 px.
- Devices stays first, then a separator, then Profiles and Users.
- Mobile switches to a compact horizontal navigation without hiding access to any view.
- View state is addressable: Devices is `/me/devices`, Profiles is `/profiles`, and Users is `/users`.
- Administrator-only routes redirect non-administrators to `/me/devices`.

## Collection views

- Page background is continuous. Toolbars and lists never share an extra outer card or backing surface.
- Search and toolbar actions align to one height and one baseline.
- List border owns the list; row separators never double with outer borders.
- Hovering a row highlights its complete visual subtree, including expanded content.
- Hovering a row action does not imply row activation.
- Empty, loading, filtered-empty and error states occupy the same list region without layout jumps.
- Empty results render only after the first request settles. Loading feedback is delayed by 180 ms and, once visible, remains for at least 320 ms to prevent flashes.

## Profiles

- Clicking the identity region expands/collapses usage when usage exists.
- Chevron reflects expansion and animates only rotation.
- Delete remains a distinct danger action with confirmation.
- Add profile opens a confirmation dialog without touching the backend. `Sign in` starts device auth in-place; only then does the dialog reveal the one-time code and `Open ChatGPT` action.
- Usage details mount lazily when a row expands; persisted limits refresh through normal gateway traffic.
- Usage bars show remaining capacity and relative reset time (`Resets in 5d 14h`).
- Only the currently expanded profile is hot. Opening it queues an immediate idempotent Celery refresh; while it remains open and visible, another refresh is requested at most once a minute. Collapsing it, navigating away, or hiding the document stops new requests.
- Values older than three minutes use non-blocking shimmer placeholders; the last known layout stays stable while the worker refreshes the snapshot.

## Devices

- Device rows show status, name, last use and a shortened non-secret identifier.
- Add opens a dialog; the generated secret is shown exactly once.
- Delete requires confirmation and revokes the device secret immediately.
- Copy gives inline success feedback without a blocking alert.
- Secret and one-time-code surfaces are whole-control copy targets: blue on hover/focus, green after copying, with `Copy` / `Copied` tooltips.
- Secrets never appear in tooltips, logs or persistent list rows.

## Users

- Administrator-only actions are visually distinct from read-only information.
- Add/edit forms use `username` as the email-shaped login field without renaming the API field.
- Edit starts from current username, nickname and role; password remains blank and is omitted unless replaced.
- Role choices are restricted to `user | administrator`.
- Password hashes and password values are never rendered in list/detail responses.

## Motion and accessibility

- Motion durations stay in the 80–180 ms range and use transform/opacity where possible.
- `prefers-reduced-motion` disables decorative motion.
- Icon-only actions have an accessible name and custom tooltip.
- Focus is always visible for keyboard navigation.
- Dialogs use `Teleport`, modal semantics, Escape handling and deliberate initial focus.
- Escape restores focus to the trigger without displaying a focus ring or tooltip solely because of programmatic focus restoration.
- Accidental page-wide text selection is disabled; editable fields remain selectable.
