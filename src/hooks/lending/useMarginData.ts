import { getAvailableMarginChainIds, RawCurrency } from "@1delta/lib-utils"
import { AprData } from "@1delta/lib-utils"
import { BasicReserveResponse, convertLenderUserDataResult } from "@1delta/margin-fetcher"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"

import { fetchChainDataWithChunking } from "./utils"

import { useMarginPublicData } from "./usePoolData"
import { useMainPrices, useMainPricesHist } from "../prices/useMainPrices"

export interface MinimalPositionInfo {
    subAccount?: string
    poolId: string // pool identifier
    asset: RawCurrency // keep asset address for convenience
    sizeUSD: number
    size: number
}
export interface LenderUiSummary {
    lender: string
    chain: string
    netWorth: number
    netWorth24h: number
    apr: number
    assetsLong?: MinimalPositionInfo[]
    assetsShort?: MinimalPositionInfo[]
    healthFactors?: number[]
    leverages?: number[]
}

export interface UserPositions {
    userData:
        | {
              [chainId: string]: {
                  [lender: string]: { [account: string]: BasicReserveResponse }
              }
          }
        | undefined
    lenderTotals: LenderUiSummary[]
    total: number
    total24h: number
    apr?: number
}

/**
 * Fetches margin public and user data
 */
const chainIds = getAvailableMarginChainIds()

export function useMarginData(chainId: string, account?: string) {
    const queryClient = useQueryClient()
    const { lenderData, isPublicDataLoading } = useMarginPublicData(chainId)

    const [mainData, setMainData] = useState<{ [chainId: string]: any[] }>()

    const query = useMemo(() => {
        if (!account || !lenderData || !lenderData[chainId]) return []
        return Object.keys(lenderData[chainId].data ?? {}).map((lender) => ({
            account,
            lender,
            // this is to dynamically fetch assets for which we have market data
            assets: Object.keys(lenderData[chainId].data[lender].data),
        }))

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account, chainId, isPublicDataLoading])

    const { data: prices } = useMainPrices()
    const { data: histPrices } = useMainPricesHist()

    // 1️⃣ Fetch all raw data using one query per chain
    const { data: results } = useQuery({
        queryKey: ["lenderUserDataRaw", chainId],
        queryFn: async () => {
            if (!query || query.length === 0) {
                return null
            }
            const result = await fetchChainDataWithChunking(chainId, query)
            return result
        },
        staleTime: 3 * 60 * 1000, // 3 mins
        refetchInterval: 5 * 60 * 1000, // 5 minutes
        refetchIntervalInBackground: false,
        enabled: !!query && query.length > 0,
        retry: (failureCount: number, error: any) => {
            console.log(`userLenderFetcher retry attempt ${failureCount} for chain ${chainId}:`, error)
            return failureCount < 2
        },
        retryDelay: (attemptIndex: number) => {
            const delay = Math.min(1000 * Math.pow(2, attemptIndex), 5000)
            return delay
        },
    })

    const isLoading = results?.some((r) => r.isLoading)
    const error = results?.find((r) => r.error)?.error

    useEffect(() => {
        const rawDataMap: { [chainId: string]: any[] } = { [chainId]: results as any[] }

        if (Object.keys(rawDataMap).length > 0) {
            setMainData((prev) => ({ ...prev, ...rawDataMap }))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results])

    const userData = useMemo(() => {
        if (!mainData) return undefined
        const data: {
            [chainId: string]: {
                [lender: string]: any
            }
        } = {}

        const raw = mainData[chainId]

        // allocate data
        let converted: any = {}
        try {
            // convert data
            converted = convertLenderUserDataResult(chainId, query, raw, prices, histPrices, lenderData)

            data[chainId] = converted
        } catch {
            // in case of errors, we just jump to the next chainId
            console.warn("failed to fetch user data for", chainId)
        }

        return data
    }, [mainData, prices, histPrices, lenderData, query])

    // 2️⃣ Convert raw -> enriched data when pricing or state changes
    const userPositions: UserPositions = useMemo(() => {
        let total = 0
        let total24h = 0
        let wApr = 0
        let lenderTotals: LenderUiSummary[] = []

        // return no data here
        if (!userData || !lenderData || !query) {
            return {
                userData,
                // create shallow empty dataset
                lenderTotals: [],
                total,
                total24h,
            }
        }

        for (const chainId of chainIds) {
            const converted = userData[chainId]
            if (!converted) continue

            // get totals
            const totalsThis: LenderUiSummary[] = []
            // iterate over lender to data
            Object.entries(converted).forEach(([lender, datas]) => {
                /**
                 * `datas` has this layout
                 * walletAddress -> {
                 *    balanceData: subAccount -> data,
                 *    lender: subAccount -> poolId -> data
                 * }
                 */
                let val = 0
                // convert account to data as data array
                Object.values(datas ?? {}).forEach((d: any) => {
                    let wThisApr = 0
                    let posVal = 0
                    let posVal24h = 0
                    const healthFactors: number[] = []
                    const leverages: number[] = []
                    // balanceData maps from subAccount to final data
                    Object.entries(d.balanceData ?? {}).forEach(([k, e]: [string, any]) => {
                        // increment balances
                        val += e.nav
                        if (e.nav > 0) posVal += e.nav
                        if (e.nav24h > 0) posVal24h += e.nav24h
                        if (e.nav > 0) {
                            const aprTimesNav = e.nav * calculateNetAprOnNav(d.aprData[k], e.deposits, e.debt)

                            wApr += aprTimesNav
                            wThisApr += aprTimesNav
                        }
                        leverages.push((e.deposits ?? 0) / (e.nav ?? 0))
                        const adjDebt = e.adjustedDebt ?? 0
                        healthFactors.push(adjDebt !== 0 ? (e.collateral ?? 0) / adjDebt : Infinity)
                    })
                    // add minmal asset data
                    const assetsLong: MinimalPositionInfo[] = []
                    const assetsShort: MinimalPositionInfo[] = []
                    Object.entries(d.lendingPositions ?? {}).forEach(([k, subAccountToPool]: [string, any]) => {
                        Object.entries(subAccountToPool ?? {}).forEach(([_, data]: [string, any]) => {
                            const nrSize = Number(data.deposits)
                            if (nrSize > 0)
                                assetsLong.push({
                                    subAccount: k,
                                    asset: lenderData[chainId].data?.[lender].data[data.poolId].asset,
                                    poolId: data.poolId,
                                    size: nrSize,
                                    sizeUSD: data.depositsUSD,
                                })
                            const nrDebt = Number(data.debt)
                            if (nrDebt > 0) {
                                assetsShort.push({
                                    subAccount: k,
                                    poolId: data.poolId,
                                    asset: lenderData[chainId].data?.[lender].data[data.poolId].asset,
                                    size: nrDebt,
                                    sizeUSD: data.debtUSD,
                                })
                            }
                        })
                    })
                    // the total does not include bad debt
                    total += posVal
                    total24h += posVal24h
                    if (val !== 0)
                        // add entry for array
                        totalsThis.push({
                            lender,
                            chain: chainId,
                            netWorth: val,
                            netWorth24h: val < 0 ? val : posVal24h,
                            assetsShort,
                            assetsLong,
                            healthFactors,
                            leverages,
                            apr: val < 0 ? 0 : wThisApr / val,
                        })
                })
            })
            lenderTotals = [...lenderTotals, ...totalsThis]
        }

        return {
            userData,
            lenderTotals: lenderTotals.sort((a, b) => (a.netWorth > b.netWorth ? -1 : 1)),
            total,
            total24h,
            apr: total > 0 ? wApr / total : 0,
        }
    }, [userData, lenderData, query])

    // 3️⃣ Refresh a subset of chains
    const refetchChains = useCallback(
        async (chainId?: string, lender?: string): Promise<void> => {
            if (chainId) {
                const chainQueries = query
                if (!chainQueries) return

                let queriesToFetch = chainQueries
                if (lender) {
                    const lenderQuery = chainQueries.find((q: any) => q.lender === lender)
                    queriesToFetch = lenderQuery ? [lenderQuery] : []
                }

                if (queriesToFetch.length === 0) return

                const result = await fetchChainDataWithChunking(chainId, queriesToFetch)

                // replace chain
                setMainData((prev) => ({
                    ...(prev || {}),
                    [chainId]: [{ data: result }],
                }))
            } else {
                await queryClient.refetchQueries({ queryKey: ["lenderUserDataRaw"] })
            }
        },
        [query, queryClient]
    )

    const refetch = () => {
        results?.forEach((r) => r.refetch())
    }

    return {
        lenderData,
        prices,
        userPositions,
        isLoading,
        error,
        refetch,
        refetchChains,
    }
}

function calculateNetAprOnNav(apr: AprData, deposit: number, debt: number): number {
    const nav = deposit - debt
    if (nav <= 0) return 0 // negative nav does not incur yield

    const depositApr = apr.depositApr + apr.stakingDepositApr + apr.rewardDepositApr
    const debtApr = apr.borrowApr + apr.stakingBorrowApr - apr.rewardBorrowApr

    const netApr = (depositApr * deposit - debtApr * debt) / nav
    return netApr
}
