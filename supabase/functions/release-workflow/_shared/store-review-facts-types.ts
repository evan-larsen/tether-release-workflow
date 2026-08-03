import type { StoreBuildIdentity } from './store-status-types.ts';

export interface StoreReviewFactsRequest extends StoreBuildIdentity {
  action: 'get_store_build_review_facts';
}
