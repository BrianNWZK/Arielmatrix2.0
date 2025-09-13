export class EnergyEfficientConsensus {
  constructor(validators = []) {
    this.validators = validators;
  }

  async proposeBlock(block) {
    const votes = [];
    for (const v of this.validators) {
      const approved = Math.random() > 0.1;
      votes.push({ validator: v, approved });
    }
    return { block, votes };
  }

  async verifyBlock(block, votes) {
    const approvals = votes.filter(v => v.approved).length;
    return approvals > this.validators.length * 2/3;
  }
}
