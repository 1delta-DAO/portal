export function getFormattedPrice(p: any) {
    try {
        return p?.toFixed(4)
    } catch {
        return "-"
    }
}
