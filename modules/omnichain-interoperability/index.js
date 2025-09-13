import { CrossChainBridge } from "../cross-chain-bridge/index.js";

export class OmnichainInterop {
  constructor() {
    this.bridge = new CrossChainBridge();
  }

  async swapAssets(ethWallet, solWallet, amount) {
    return this.bridge.bridgeEthToSolana(amount);
  }
}
