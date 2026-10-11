import { z } from 'zod';

export const SearchListingsArgsSchema = z
  .object({
    domain: z.enum(['olx.pt', 'olx.pl', 'olx.bg', 'olx.ro', 'olx.ua']),
    query: z.string().min(1).max(100).optional(),
    category: z.string().optional(),
    location: z.string().optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().min(0).optional(),
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(50).default(20),
    sortBy: z.enum(['relevance', 'date', 'price-asc', 'price-desc']).default('relevance'),
  })
  .refine(data => !data.maxPrice || !data.minPrice || data.maxPrice >= data.minPrice, {
    message: 'Max price must be greater than or equal to min price',
    path: ['maxPrice'],
  })
  .refine(data => data.query || data.category || data.location, {
    message: 'At least one of query, category, or location must be provided',
    path: ['query'],
  });

export type SearchListingsArgs = z.infer<typeof SearchListingsArgsSchema>;

export const GetListingDetailsArgsSchema = z
  .object({
    domain: z.enum(['olx.pt', 'olx.pl', 'olx.bg', 'olx.ro', 'olx.ua']),
    // Rejects path and selector metacharacters (quotes, slashes, whitespace, ?, #)
    // that have no place in an OLX id. The id is also encoded before it reaches a
    // URL and passed as data to DOM queries; this is the outer guard.
    listingId: z
      .string()
      .min(1)
      .regex(
        /^[A-Za-z0-9._-]+$/,
        'listingId may contain only letters, digits, dot, underscore, dash'
      )
      .optional(),
    // The listing's own page. Works for listings no search has returned in this
    // session; the scraper accepts only URLs on the requested domain.
    url: z.string().url().optional(),
    includeImages: z.boolean().default(true),
    includeSellerInfo: z.boolean().default(true),
  })
  .refine(data => data.listingId || data.url, {
    message: 'Either listingId or url must be provided',
    path: ['listingId'],
  });

export type GetListingDetailsArgs = z.infer<typeof GetListingDetailsArgsSchema>;
