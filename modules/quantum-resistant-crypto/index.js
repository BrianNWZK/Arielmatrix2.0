import { kyberKeyPair, dilithiumKeyPair } from "node-pqc";

export class QuantumResistantCrypto {
  constructor() {
    this.kyber = kyberKeyPair();
    this.dilithium = dilithiumKeyPair();
  }

  getPublicKeys() {
    return { kyber: this.kyber.publicKey, dilithium: this.dilithium.publicKey };
  }
}
