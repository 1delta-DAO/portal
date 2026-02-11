import { BACKEND_BASE_URL } from '../../config/backend'

const WORKER_ENDPOINT = `${BACKEND_BASE_URL}/v1/data/prices/latest-asof?hoursAgo=`

interface OracleData {
  [key: string]: number
}

export async function fetchMainPrices(): Promise<OracleData> {
  try {
    const pricesRaw = await fetch(WORKER_ENDPOINT + '0')
    const envelope = await pricesRaw.json()
    return envelope.data?.prices ?? {}
  } catch {
    console.log('failedprice fetch')
    return {}
  }
}

export async function fetchMainPricesHist(): Promise<OracleData> {
  try {
    const pricesRaw = await fetch(WORKER_ENDPOINT + '24')
    const envelope = await pricesRaw.json()
    return envelope.data?.prices ?? {}
  } catch {
    console.log('failed hist price fetch')
    return {}
  }
}
