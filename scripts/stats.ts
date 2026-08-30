/**
 * Evidence for the "clearly better than random" claim: runs the solver and the
 * random baseline over every case and prints the comparison. npm run stats
 */
import { CASES, PUBLISHED_CASES } from '../lib/cases';
import { randomBaselineForCase, solveCase } from '../lib/solver';

let sumOpt = 0, sumRand = 0, sumAssigned = 0, sumJobs = 0, sumBlocked = 0;
for (const day of CASES) {
  const { plan, stats } = solveCase(day);
  const base = randomBaselineForCase(day);
  sumOpt += stats.totalTravelMin; sumRand += base.meanTravelMin;
  sumAssigned += stats.assigned; sumJobs += day.jobs.length; sumBlocked += stats.blocked;
  const pct = (((base.meanTravelMin - stats.totalTravelMin) / base.meanTravelMin) * 100).toFixed(0);
  console.log(
    `${day.id.padEnd(14)} tech ${String(day.technicians.length).padStart(2)} jobs ${String(day.jobs.length).padStart(2)}` +
    ` | placed ${String(stats.assigned).padStart(2)} blocked ${String(stats.blocked).padStart(2)}` +
    ` | travel ${String(stats.totalTravelMin).padStart(4)} (greedy ${String(stats.greedyTravelMin).padStart(4)})` +
    ` vs random ${String(base.meanTravelMin).padStart(4)}  -${pct}%  [${stats.ordering}]`,
  );
}
console.log(`\nTOTALS: placed ${sumAssigned}/${sumJobs}, blocked ${sumBlocked}, travel ${sumOpt} vs random ${sumRand} = -${(((sumRand-sumOpt)/sumRand)*100).toFixed(1)}%`);
