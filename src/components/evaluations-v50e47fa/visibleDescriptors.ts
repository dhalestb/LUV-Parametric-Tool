import { ARCH_DESCRIPTORS, type ArchDescriptorId } from './objDescriptorAnalysis';

/** Descriptors available in the Evaluations tab, in display order. */
export const VISIBLE_DESCRIPTOR_IDS: ArchDescriptorId[] = ['openVolume','visuallyConnected','circulationActivated','verticallyIntegrated','centralized'];
export const VISIBLE_DESCRIPTORS = VISIBLE_DESCRIPTOR_IDS.map(id => ARCH_DESCRIPTORS.find(descriptor => descriptor.id === id)!);
