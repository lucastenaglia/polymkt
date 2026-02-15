export const CTF_EXCHANGE_ABI = [
    "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)"
];

export const CONDITIONAL_TOKENS_ABI = [
    "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external",
    "function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256)"
];

export const CTF_EXCHANGE_ADDR_BINARY = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
export const CONDITIONAL_TOKENS_ADDR = '0x4D97BcdB59363486C1489999Bc31ba6eE99A2946';
export const USDC_E_ADDR = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
