import { ethers } from "ethers";

const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const PAYMASTER = "0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47";
const RPC_URL = "https://ethereum-rpc.publicnode.com";

const provider = new ethers.JsonRpcProvider(RPC_URL);

(async () => {
  const ep = new ethers.Contract(
    ENTRY_POINT,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const dep = await ep.balanceOf(PAYMASTER);
  console.log("Paymaster deposit in EntryPoint:", ethers.formatEther(dep), "ETH");
})();
