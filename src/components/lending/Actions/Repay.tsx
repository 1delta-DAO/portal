import { AmountUsdHint } from "../UsdAmount"
import { ActionAmountInputProps, formatTokenForInput, getUserTokenStats, parseAmount } from "./common"
import { AmountQuickButtons } from "./QuickButton"

export const RepayAmountInput: React.FC<ActionAmountInputProps> = ({ selection, pool, simulated, onChangeAmount }) => {
    const amountUsd = simulated?.amountUsd
    const { debtToken } = getUserTokenStats(pool)
    const currentAmount = parseAmount(selection.amount)
    const overMax = debtToken > 0 && currentAmount > debtToken + 1e-9

    const handleMax = () => {
        if (!debtToken || debtToken <= 0) return
        onChangeAmount(formatTokenForInput(debtToken))
    }

    return (
        <div className="form-control min-w-0">
            <div className="flex justify-between items-center mb-1">
                <span className="label-text text-xs">Amount</span>
                <AmountQuickButtons maxAmount={debtToken} onSelect={(val) => onChangeAmount(val)} />
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

            {overMax && (
                <div className="mt-1 text-[10px] text-error">
                    Exceeds repayable debt (
                    {debtToken.toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                    })}
                    ).
                </div>
            )}
        </div>
    )
}
