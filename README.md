# Portal — 1delta Allocator UI

A multi-chain DeFi lending and trading interface built with React, Vite, and the 1delta SDK suite. Connect your wallet, browse lending markets across chains, manage positions, and execute advanced operations like looping and collateral swaps.

## Getting Started

```bash
pnpm i && pnpm start
```

Set `VITE_BACKEND_BASE_URL` in `.env` to override the default API endpoint. A `VITE_WC_PROJECT_ID` (WalletConnect/Reown) is required for mobile wallet connections.

Feature flags: `VITE_OPTIMIZER_ENABLED=true` shows the Optimize tab (default OFF); `VITE_BRIDGE_UI_ENABLED=false` hides the Cross-Chain (bridge) tab, which is shown by default with a "Beta" pill; `VITE_USER_POSITIONS_RPC=true` reads user positions through the client-side RPC flow rather than the API (default OFF).

### Chain selection

Earn and the Optimizer browse up to 5 chains at once; Lending, Looping and Swap stay on a single chain, and the Cross-Chain tab picks a chain per side inside its own panel. The selection lives in the URL as a CSV (`/earn/1,8453`), so single-chain links keep working unchanged.

Selecting chains is a data filter — it never switches the connected wallet network. That only happens when you submit a transaction, against the chain of the row you acted on.

## Backend API (for integrators)

The UI talks to the 1delta backend at `https://portal.1delta.io`. The API reference is at [`https://portal.1delta.io/v1/docs`](https://portal.1delta.io/v1/docs).

**Do not call the API directly from a forked frontend.** Instead:

1. Generate an API key on the 1delta auth page: [`https://auth.1delta.io/`](https://auth.1delta.io/).
2. Stand up a thin server-side proxy that forwards requests to `https://portal.1delta.io` and attaches your API key as a header. This keeps the key off the client bundle.
3. Point `VITE_BACKEND_BASE_URL` at your proxy.

Calling the public endpoint without a key (or exposing the key in client-side code) is not supported for production integrations.

### How requests are made

Every backend call in this app goes through **`src/sdk/http.ts`** — one module,
two functions:

```ts
// Unwraps the `{ success, data }` envelope, throws ApiError on failure.
const data = await apiFetch<PoolsData>('/v1/data/lending/pools', {
  params: { chainId, count: 500 },   // undefined values are dropped
})

// Keeps the whole envelope, for /v1/actions/* endpoints whose payload
// is under `actions`. A `body` switches the request to POST.
const { data, actions } = await apiFetchEnvelope('/v1/actions/lending/deposit', {
  params: { marketUid, amount },
  body: simulationBody,
})
```

That single choke point is what makes the proxy setup above a small change:

- **Headers** — return them from `apiHeaders()` in `src/config/backend.ts`.
  Every request picks them up. Do not put a secret API key there; anything it
  returns ships in the client bundle. That is what the proxy is for.
- **Errors** — both functions throw `ApiError` (with `status`, `code`, `path`)
  on a transport failure, a non-2xx, or `success: false`. They never resolve
  with a sentinel, so a failed query looks failed to React Query.

Two `fetch` calls in the app deliberately bypass this, because they don't talk
to the 1delta backend and don't speak its envelope: `hooks/lending/executeRpcCalls.ts`
(a chain RPC) and `lib/data/tokenListsCache.ts` (third-party token lists).

## Tech Stack

- **React 19** + **TypeScript 5.9** — UI framework
- **Vite 8** — dev server and bundler
- **Tailwind CSS 4** + **DaisyUI 5** — styling and component library
- **wagmi 2** + **viem 2** — EVM wallet interaction and contract calls
- **RainbowKit 2** — wallet connection modal
- **TanStack Query 5** — async data fetching and caching
- **react-router-dom 7** — URL-driven routing
- **1delta packages** (`@1delta/chain-registry`, `@1delta/providers`) — chain metadata and RPC providers

Tables paginate rather than virtualize; there is no virtualization dependency.

## Where things are

Feature code lives under `src/components/lending/`. Each directory has its own
`README.md` next to the code — those are the accurate map, because they move
with the files they describe. This section only names the directories.

```
src/
├── App.tsx                      # Root layout: navbar, providers, router
├── main.tsx                     # Entry: Wagmi → QueryClient → RainbowKit → Router
├── wagmi.ts                     # Chain config, transports, polling intervals
│
├── sdk/                         # Everything that talks to the backend
│   ├── http.ts                  # ← the ONE place requests are made. Start here.
│   ├── lending-helper/          # Action builders + the data model:
│   │                            #   poolTypes.ts        /lending/pools (PoolEntry)
│   │                            #   marketTypes.ts      /lending/latest (PoolDataItem)
│   │                            #   userPositionTypes.ts /lending/user-positions
│   ├── earn-helper/             # Earn listing + positions
│   ├── vaults-helper/           # Vault catalog, actions, withdrawals
│   └── hooks/                   # Chain registry
│
├── components/lending/
│   ├── LendingTab.tsx           # Tab bar + router; tab panels are lazy-loaded
│   ├── tabs/earn/               # Earn — browse pools, deposit (+ vaults/)
│   ├── tabs/lending/            # Lending — position management
│   ├── tabs/trading/            # Looping — loop / collateral-swap / debt-swap / close
│   ├── tabs/optimizer/          # Pair-level allocation optimizer (flag-gated)
│   ├── tabs/unified/            # Unified Earn (flag-gated)
│   ├── actions/                 # Deposit / Withdraw / Borrow / Repay forms
│   ├── shared/                  # Cross-tab components (positions, modals, badges)
│   ├── dashboard/               # Sort helpers, LtvBadge
│   └── terms/                   # Term sheets: rendering + formatting
│
├── components/swap/             # Spot swap + cross-chain swap panels
├── components/token-selection/  # Token picker modal
├── components/common/           # UI primitives (AmountInput, Logo, pagination, toasts…)
│
├── hooks/
│   ├── lending/                 # Pool/user/IRM data, order books, RPC multicall
│   ├── balances/ prices/        # Wallet balances, token prices
│   ├── earn/ vaults/            # Earn + vault queries
│   └── use*.ts                  # Chains, token lists, debounce, table sort/pagination
│
├── contexts/                    # Spy mode (view-as-address), risk mode, batch mode
├── config/backend.ts            # Base URL + the header hook for a fork's auth
├── utils/                       # format, routes, explorer, price, validation
└── types/ lib/ styles/
```

### The two files to read first

- **`src/sdk/http.ts`** — every backend request goes through `apiFetch` /
  `apiFetchEnvelope`. Response-envelope handling, error semantics and header
  injection all live there, so a fork changes them in one place.
- **`src/sdk/lending-helper/poolTypes.ts`** — `PoolEntry`, the shape of a
  lending market, which every table row and action panel is built from.

## Architecture

### Routing

Single dynamic route: `/:tab?/:chainId?/:lender?`

| URL | Tab | View |
|-----|-----|------|
| `/earn` | Earn | Browse pools, deposit |
| `/lending/1/aave-v3` | Lending | Manage AAVE V3 positions on Ethereum |
| `/loop/42161/morpho-blue` | Looping | Leverage ops on Morpho Blue (Arbitrum) |
| `/swap` | Swap | Spot token swaps |

URL helpers in `src/utils/routes.ts`.

### State Management

| Layer | Tool | Examples |
|-------|------|---------|
| Server state | React Query | Pool data, user positions, balances, IRM curves |
| URL state | react-router | Tab, chain, lender selection |
| Global UI | React Context | IRM dock panels, toast notifications, spy mode |
| Local state | useState | Form inputs, filters, selections, pagination |

### Code splitting

Tab panels are lazy-loaded in `LendingTab.tsx`. The flag checks sit outside the
JSX, so a build with a tab disabled never requests its chunk — the Optimizer
(~3,400 lines, default off) costs nothing when it is off. Adding a tab means
adding both a `lazy()` element and its flag test.

### Data Flow (Lending Transaction)

1. User fills form in action component (e.g. `DepositAction`)
2. `useActionExecution` calls `fetchLendingAction()` → `apiFetchEnvelope` builds tx + simulates
3. Backend returns simulated health factor and balance changes
4. User confirms → `useSendLendingTransaction` handles EIP-2612 permit + tx submission
5. On success → React Query invalidates `userData` + `tokenBalances` queries
6. UI re-renders with fresh on-chain data

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Start Vite dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm format` | Format code with Prettier |
| `pnpm test` | Run the unit tests (vitest) |

## Supported Protocols

Any lending protocol in the 1delta lender registry, including AAVE V2/V3, Morpho Blue, Euler V2, Compound V2/V3, and others.

## License

MIT — 1delta DAO
