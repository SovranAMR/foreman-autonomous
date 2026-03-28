import { nanoid } from 'nanoid';
import { Assumption, AssumptionContext, AssumptionReason } from './models';

/**
 * Generates a proactive assumption based on the provided context.
 * This is the core of the Assumption Engine, designed to prevent blocking
 * by synthesizing plausible data when information is missing.
 *
 * @param context - The context surrounding the need for an assumption.
 * @returns An immutable Assumption object.
 */
export const generateAssumption = (
  context: AssumptionContext,
): Assumption => {
  const id = `ASMP-${nanoid(8)}`; // e.g., ASMP-a1b2c3d4

  // The Strategy Pattern will be applied here. For now, a default is used.
  switch (context.reason) {
    // Future cases for specific reasons will delegate to specialized generators.
    // e.g., case AssumptionReason.MISSING_FILE_CONTENT:
    //         return generateFileContentAssumption(id, context);

    default:
      // Placeholder logic for the initial implementation.
      return {
        id,
        reason: context.reason,
        context,
        synthesizedData: {
          type: 'placeholder',
          value: 'Placeholder data synthesized by the Assumption Engine.',
          notes: 'This is default data. The engine should be expanded with a specific strategy for this reason.',
        },
      };
  }
};