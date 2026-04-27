import z from 'zod';

// utils/validation.ts
const IS_LOCKED = process.env.VITE_COTTAGE_FOOD_LOCK === 'lock';

export const cottageFoodRefinement = (data: any, ctx: z.RefinementCtx) => {
    // 1. Global Country Lock (Always Enforced)
    if (data.country !== 'United States') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "We only ship within the United States.",
            path: ['country'],
        });
    }

    if (data.country_code !== 'US') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid country code.",
            path: ['country_code'],
        });
    }

    // 2. Conditional Texas Lock (Cottage Food Law)
    if (IS_LOCKED) {
        if (data.region !== 'Texas') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Cottage food laws restrict sales to Texas residents only.",
                path: ['region'],
            });
        }
        if (data.region_code !== 'TX') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Orders must be placed within Texas (TX).",
                path: ['region_code'],
            });
        }
    }
};
