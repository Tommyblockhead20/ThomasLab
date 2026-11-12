import type { MachineId } from './types';
export const FAULTS: Record<MachineId, string> = {
  steering: 'Rudder linkage binding',
  engines: 'Valve gear sticking',
  valve: 'Steam joint leaking',
  wireless: 'Receiver contacts intermittent',
  compass: 'Compass card sticking',
  gauge: 'Pressure gauge out of calibration',
};
export const serviceSeconds = (role: string | null) => role?.includes('Engineer') ? 12 : 20;
