import { LendingMode, MorphoParams, SweepType, TransferToLenderType } from '@1delta/calldata-sdk';

interface CreateDepositBaseParams {
	receiver?: string;
	amount: string;
	asset: string;
	lender: string;
	morphoParams?: MorphoParams;
	transferType?: TransferToLenderType;
}
interface CreateWithdrawBaseParams {
	receiver?: string;
	amount: string;
	asset: string;
	lender: string;
	transferType?: TransferToLenderType;
	morphoParams?: MorphoParams;
}

interface CreateBorrowBaseParams {
	receiver?: string;
	amount: string;
	asset: string;
	lender: string;
	lendingMode?: LendingMode;
	morphoParams?: MorphoParams;
}
interface CreateRepayBaseParams {
	receiver?: string;
	amount: string;
	asset: string;
	lender: string;
	lendingMode?: LendingMode;
	morphoParams?: MorphoParams;
	transferType: TransferToLenderType;
}

export interface CreateTransferBaseParams {
	asset: string;
	amount: string;
	receiver?: string;
}

export interface CreateWrapBaseParams {
	amount: string;
}

/** better readable sweep classifier */
export enum SweepAction {
	Amount = 'Amount',
	BalanceWithCheck = 'BalanceWithCheck',
}

export function toSweepType(sa: SweepAction) {
	if (sa == SweepAction.Amount) return SweepType.AMOUNT;
	if (sa == SweepAction.BalanceWithCheck) return SweepType.VALIDATE;
	throw new Error('Unsupported SweepAction');
}

export interface CreateUnwrapBaseParams {
	amount: string;
	receiver: string;
	sweepAction: SweepAction;
}

export interface CreateSweepBaseParams {
	asset: string;
	receiver: string;
	amount: string;
	sweepAction: SweepAction;
}

export enum AllocationOperation {
	Deposit = 'Deposit',
	Withdraw = 'Withdraw',
	Borrow = 'Borrow',
	Repay = 'Repay',
	Transfer = 'Transfer',
	Wrap = 'Wrap',
	Unwrap = 'Unwrap',
	Sweep = 'Sweep',
}

// One action per operation
export type AllocationAction =
	| {
			type: AllocationOperation.Deposit;
			params: CreateDepositBaseParams;
	  }
	| {
			type: AllocationOperation.Withdraw;
			params: CreateWithdrawBaseParams;
	  }
	| {
			type: AllocationOperation.Borrow;
			params: CreateBorrowBaseParams;
	  }
	| {
			type: AllocationOperation.Repay;
			params: CreateRepayBaseParams;
	  }
	| {
			type: AllocationOperation.Transfer;
			params: CreateTransferBaseParams;
	  }
	| {
			type: AllocationOperation.Sweep;
			params: CreateSweepBaseParams;
	  }
	| {
			type: AllocationOperation.Wrap;
			params: CreateWrapBaseParams;
	  }
	| {
			type: AllocationOperation.Unwrap;
			params: CreateUnwrapBaseParams;
	  };

export type PermissionTxn = any & {
	info?: string;
};
