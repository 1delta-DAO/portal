import { AmountUsdHint } from "../UsdAmount"
import { ActionAmountInputProps, formatTokenForInput, parseAmount } from "./common"
import { AmountQuickButtons } from "./QuickButton"

export const BorrowAmountInput: React.FC<ActionAmountInputProps> = ({
    selection,
    pool,
    simulated,
    onChangeAmount,
    price,
}) => {
    const amountUsd = simulated?.amountUsd

    const borrowCapacityBefore =
        simulated != null
            ? simulated.balanceBefore.borrowDiscountedCollateral - simulated.balanceBefore.adjustedDebt
            : 0

    const priceValidated = price ?? 0

    const maxBorrowToken =
        borrowCapacityBefore > 0 && priceValidated > 0
            ? borrowCapacityBefore / priceValidated
            : 0

    const currentAmount = parseAmount(selection.amount)
    const overMax = maxBorrowToken > 0 && currentAmount > maxBorrowToken + 1e-9

    const handleMax = () => {
        if (!maxBorrowToken || maxBorrowToken <= 0) return
        onChangeAmount(formatTokenForInput(maxBorrowToken))
    }

    return (
        <div className="form-control min-w-0">
            <div className="flex justify-between items-center mb-1">
                <span className="label-text text-xs">Amount</span>
                <AmountQuickButtons
                    maxAmount={maxBorrowToken}
                    onSelect={(val) => onChangeAmount(val)}
                />
            </div>

            <div className="relative">
                <input
                    type="text"
                    className="input input-bordered input-sm w-full text-right pr-20"
                    placeholder="0.0"
                    value={selection.amount}
                    onChange={(e) => onChangeAmount(e.target.value)}
                />
                <AmountUsdHint amountUsd={amountUsd} />
            </div>

            {/* -------------------------------
                Reserve space for validation messages
               ------------------------------- */}
            <div className="min-h-4 mt-1 text-[10px]">
                {overMax && (
                    <div className="text-error">
                        Exceeds borrowable capacity (
                        {maxBorrowToken.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                        })}
                        ).
                    </div>
                )}

                {!overMax && maxBorrowToken <= 0 && borrowCapacityBefore <= 0 && (
                    <div className="text-base-content/60">No remaining borrowable capacity.</div>
                )}
            </div>
        </div>
    )
}
