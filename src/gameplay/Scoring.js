// Per-level stats, coin tally and grade (see docs/DESIGN.md "Grades").
export class Scoring {
  constructor() {
    this.reset(180);
  }

  reset(parTime = 180) {
    this.parTime = parTime;
    this.time = 0;
    this.shots = 0;
    this.useful = 0; // shots that hit a job target / collectible
    this.badHits = 0;
    this.coins = 0;
    this.spanners = 0;
    this.spannersTotal = 0;
    this.hintsUsed = 0;
    this.log = [];
  }

  addCoins(n, why) {
    this.coins += n;
    this.log.push({ n, why });
  }

  /** counts = Jobs.counts() */
  grade(counts) {
    const { total, done, failed } = counts;
    const frac = total ? done / total : 0;
    const all = done === total && failed === 0;
    if (all && this.time <= this.parTime && this.badHits === 0) return 'S';
    if (done === total && this.time <= this.parTime * 1.5 && this.badHits <= 1) return 'A';
    if (frac >= 0.75 && this.badHits <= 3) return 'B';
    if (frac >= 0.5) return 'C';
    return 'D';
  }

  accuracy() {
    return this.shots ? this.useful / this.shots : 0;
  }

  /** Final tally rows for the results screen + total coins. */
  summary(counts) {
    const g = this.grade(counts);
    const timeBonus = this.time <= this.parTime ? Math.round(60 + (this.parTime - this.time) * 0.5) : 0;
    const accBonus = Math.round(this.accuracy() * 50);
    const badPenalty = this.badHits * 15;
    const gradeBonus = { S: 150, A: 90, B: 50, C: 20, D: 0 }[g];
    const jobCoins = this.coins;
    const total = Math.max(0, jobCoins + timeBonus + accBonus + gradeBonus - badPenalty);
    const stars = ({ S: 3, A: 2, B: 1, C: 1, D: 0 })[g] + (this.spannersTotal && this.spanners === this.spannersTotal ? 1 : 0);
    return { grade: g, jobCoins, timeBonus, accBonus, badPenalty, gradeBonus, total, stars };
  }
}
