import type { MachineId } from './types';
export const FAULTS: Record<MachineId, string> = {
  steering: 'No. 1 steering engine binding',
  feedwater: 'No. 1 feed pump delivery failing',
  condenser: 'Condenser air leak',
  dynamos: 'No. 1 dynamo governor sticking',
  engines: 'Valve gear sticking',
  valve: 'Steam joint leaking',
  wireless: 'Receiver contact failed',
  compass: 'Compass alignment shifted',
  gauge: 'Pressure gauge out of calibration',
};
export const serviceSeconds = (role: string | null) => (role?.includes('Engineer') ? 8 : 20);
