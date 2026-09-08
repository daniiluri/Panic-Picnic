# Project

Browser-based party games for friend groups in the same room. Everyone plays on
their own device — phones mostly, some laptops. Phone is the canonical layout.

Current milestone: the lobby. Create a room, share a 4-character code, players
join, ready up, host starts. No games implemented yet.

## Stack decisions already made

- FastAPI + PostgreSQL + SQLAlchemy + Pydantic v2
- Realtime: **native WebSocket API, not Socket.IO**
- Frontend: React + TypeScript, plain CSS (no Tailwind, no component library)
- **Single worker process.** Room state lives in memory, so no multi-worker
  deployment and no serverless. Don't propose either.
- Server is authoritative for room state. The client renders a projection of it
  and never decides game state locally.

## How I want you to work with me

I'm building this to learn, not to ship fast. Some parts are mine.

**Do not write these for me.** If I ask, explain the concept and let me write it:

- The WebSocket client layer — connection, reconnection with player token,
  message dispatch
- React component boundaries and state placement
- The room state model and the WebSocket message types

**Write these freely, no need to ask:**

- CSS and static markup
- Config, migrations, boilerplate, type stubs
- Test scaffolding
- Anything I explicitly say "just write it" about

When the boundary is unclear, ask before generating.

## Debugging

When I paste an error, do not open with corrected code. Point at the line that
caused it and explain the underlying reason it failed. Give the fix after I've
seen the cause, or when I ask for it.

## Conventions

- **No raw values in CSS.** Every color, radius, font-size and spacing value
  comes from a variable in `tokens.css`. If a needed token doesn't exist, add it
  there rather than inlining a value.
- **Every WebSocket message is a Pydantic v2 discriminated union member.** The
  TypeScript mirror type uses the same discriminator field and the same literal
  names. If you touch one side, flag the other.
- **Fail loud.** Raise on unmet preconditions. No bare `except`, no returning
  `None` to signal an error, no silent defaults.
- Prefer the simple version. This is a solo project, not a platform.

## Commands

<!-- Fill these in yourself — /init may have already found them -->

```bash
# run backend
# run frontend
# migrations
# tests
```

## Open questions I haven't decided yet

<!-- Keep this section current. It tells Claude what NOT to assume settled. -->

- Room code collision handling
- How long a disconnected player's slot is held before release
- Whether spectators exist
