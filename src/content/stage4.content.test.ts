import stage4CopyJson from './stage4Copy.json';
import { stage4CopySchema } from './stage4Schema';
import { COLD_START_S, MANUAL_RECOVER_S, SELF_HEAL_S } from '../sim/cluster';

describe('stage 4 content', () => {
  it('stage4Copy.json matches its schema (word limits included)', () => {
    const r = stage4CopySchema.safeParse(stage4CopyJson);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });

  it('seconds quoted to players match the simulation (cluster.ts)', () => {
    const c = stage4CopyJson;
    expect(c.configure.thresholdHelp).toContain(`${COLD_START_S} seconds`);
    expect(c.diagnosis.thresholdHigh).toContain(`${COLD_START_S} seconds`);
    expect(c.configure.selfHealingHelp).toContain(`about ${SELF_HEAL_S} seconds`);
    expect(c.diagnosis.noHealing).toContain(`${MANUAL_RECOVER_S} seconds`);
    expect(c.diagnosis.noHealing).toContain(`about ${SELF_HEAL_S}`);
  });
});
