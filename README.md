# Moonbeamer

## UI

The ui is in [/ui](ui/) directory, you need to set the related environment vars for ui first, the example `.env` is [.env.example](ui/env.example)
Then install the required packages and start the web app

```bash
cd ./ui
pnpm i && pnpm dev
```

> If npm packages for ui are installed, then it can be started from root directory using `pnpm web`

## Solidity test

The solidity test does not work, because the anvil fork cannot use the precompiles

## Ts Script

Set `.env` file according to the [.env.example](.env.example) file
Execute with

### Use direct EOA Caller

```bash
pnpm i && pnpm start
```

### Use a smart contract to call permit precompile

```bash
pnpm i && pnpm contract
```

> Contract address: `0xF3f6f0cCe68be57B9605D77B7B3d424f95f04871`

## Env vars

### `MOONBEAM_RPC_URL`

Moonbeam rpc url (e.g. https://moonbeam.drpc.org)

### `PRIVATE_KEY`

Private key of the permit signer (tx signer)

### `SENDER_PRIVATE_KEY`

Private key of the sender (relay)

### `TEST_ADDR1`

Receives 0.1 xcUSDT (if tx goes through)

### `TEST_ADDR2`

Gets 0.1 xcUSDT allowance
