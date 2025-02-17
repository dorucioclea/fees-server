import { FeeAdapter } from "../utils/adapters.type";
import volumeAdapter from "@defillama/adapters/volumes/adapters/velodrome";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.002;

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: FeeAdapter = {
  fees: feeAdapter
};


export default adapter;
