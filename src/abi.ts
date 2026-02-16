export const CTF_EXCHANGE_ABI = [
    "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)"
];

export const CONDITIONAL_TOKENS_ABI = [
    "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external",
    "function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256)",
    "function balanceOf(address owner, uint256 id) view returns (uint256)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function setApprovalForAll(address operator, bool approved) external"
];

export const CTF_EXCHANGE_ADDR_BINARY = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
export const CONDITIONAL_TOKENS_ADDR = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
export const USDC_E_ADDR = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

export const GNOSIS_SAFE_ABI = [
    "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) external returns (bool)",
    "function getOwners() public view returns (address[] memory)",
    "function getThreshold() public view returns (uint256)"
];

export const CTF_PROXY_ABI = [
    "function redeem(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external",
    "function proxy(address dest, bytes data) external returns (bytes)",
    "function owner() view returns (address)"
];
