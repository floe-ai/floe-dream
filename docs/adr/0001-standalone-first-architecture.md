# Standalone-first architecture with adapter integration

The memory/context orchestrator (floe-dream) is built as a standalone library with zero Floe dependency. Integration with Floe happens through a separate Floe Adapter that lives in the Floe monorepo and imports both floe-dream and floe-bus.

We chose this over building the module directly inside the Floe monorepo because: (1) it forces clean interface boundaries (IngestionEvent in, CallFrame out), making the "usable independently" requirement real rather than aspirational; (2) it prevents the orchestrator from accumulating implicit coupling to bus internals, bridge lifecycle, or Pi types; (3) it allows non-Floe consumers (standalone agent loops, CLI tools, other frameworks) to use the memory system without pulling in Floe infrastructure.

The trade-off is slightly more ceremony for Floe integration — the adapter must translate bus events and flatten Call Frames back into message arrays. We accept this cost because the translation layer is thin and the independence guarantee is valuable for long-term portability.

## Considered Options

- **Floe-native workspace**: Build as `floe-memory` inside the monorepo, import bus types directly. Rejected because it makes independent use aspirational — consumers would need to stub or mock bus types.
- **Separate repo with optional peer dep on floe-bus**: Rejected because optional peer deps create testing and versioning complexity without meaningfully improving the interface boundary over full standalone.
