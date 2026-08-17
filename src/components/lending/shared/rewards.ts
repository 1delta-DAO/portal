// The rewards wire model moved to the sdk (it is part of the market data
// shape, not a component). This shim keeps the historical import path working.
export * from '../../../sdk/lending-helper/rewards'
