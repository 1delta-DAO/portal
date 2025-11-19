import { AmountUsdHint } from "../UsdAmount"
import { ActionAmountInputProps } from "./common"

export const DepositAmountInput: React.FC<ActionAmountInputProps> = ({ selection, simulated, onChangeAmount }) => {
    const amountUsd = simulated?.amountUsd

    return (
        <div className="form-control min-w-0">
            <div className="flex justify-between items-center mb-1">
                <span className="label-text text-xs">Amount</span>
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
        </div>
    )
}
