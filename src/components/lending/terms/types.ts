// The term-sheet wire model moved to the sdk — it mirrors the API's
// `termSheet` field and carries no React. This shim keeps the historical
// import path working for the terms/ component tree.
export * from '../../../sdk/lending-helper/termSheets'
