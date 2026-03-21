export interface RawCurrency {
  chainId: string
  address: string
  decimals: number
  symbol?: string
  name?: string
  logoURI?: string
  tags?: string[]
  props?: {
    [key: string]: any
  }
  assetGroup?: string
}

export enum TradeType {
  EXACT_INPUT = 0,
  EXACT_OUTPUT = 1,
}

export enum LendingMode {
  NONE = 0,
  STABLE = 1,
  VARIABLE = 2,
}

export interface BalanceData {
  rewards?: any
  borrowDiscountedCollateral: number
  borrowDiscountedCollateralAllActive: number
  collateral: number
  collateralAllActive: number
  deposits: number
  debt: number
  adjustedDebt: number
  nav: number
  deposits24h: number
  debt24h: number
  nav24h: number
}

export interface AprData {
  apr: number
  borrowApr: number
  depositApr: number
  rewards: any
  rewardApr: number
  rewardDepositApr: number
  rewardBorrowApr: number
  intrinsicApr: number
  intrinsicDepositApr: number
  intrinsicBorrowApr: number
}

/** Single market config */
export interface UserConfig {
  selectedMode: string
  id: string
  /** if defined and false, the user cannot interact
   *  with the market unless whitelisted */
  isWhitelisted?: boolean
}

export enum TransferToLenderType {
  Amount = 0,
  UserBalance = 1,
  ContractBalance = 2,
}

export enum SweepType {
  AMOUNT = 0,
  VALIDATE = 1,
}

/** Morpho market params */
export interface MorphoParams {
  /** tightly packed market as hex */
  market: `0x${string}`
  /** use shares - ignored for collateral */
  isShares: boolean
  /** morpho address */
  morphoB: string
  /** flash callback composer data */
  data: `0x${string}`
  /** fork id */
  pId: number
}
