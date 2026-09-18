import { registerPlugin } from '@capacitor/core';

/** Native side: plugins/proximity-haptics (Android only). */
export interface ProximityHapticsPlugin {
  pulse(options: { duration: number }): Promise<void>;
}

export const ProximityHaptics = registerPlugin<ProximityHapticsPlugin>('ProximityHaptics');
