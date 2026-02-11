import { LenderOperationSelection } from '../../contexts/LenderSelectionContext';
import { AssetBalanceSnapshot } from '../../contexts/Simulation/simulateLenderSelections';
import { CreateTxnResponse, fetchTransactionData } from './fetchFromApi';
import { generateAllocationActionsForApi } from './toApiParams';

import { BACKEND_BASE_URL } from '../../config/backend'

const ALLOCATE_ENDPOINT = `${BACKEND_BASE_URL}/v1/actions/allocate`

// ---- Allocate-specific types and function ----

export interface AllocateResponseData {
  operations: string;
  data: string;
  value: string;
  permissionTxns: { to: string; data: string; value: string; info?: string; }[];
}

export async function fetchAllocateAction(params: {
  chainId: string;
  operator: string;
  selections: LenderOperationSelection[];
  finalAssetBalances: Record<string, AssetBalanceSnapshot>;
}): Promise<CreateTxnResponse<AllocateResponseData>> {
  const actions = generateAllocationActionsForApi({
    selections: params.selections,
    finalAssetBalances: params.finalAssetBalances,
    receiver: params.operator,
  });

  return fetchTransactionData<AllocateResponseData>(ALLOCATE_ENDPOINT, {
    chainId: params.chainId,
    operator: params.operator,
    actions,
  });
}
