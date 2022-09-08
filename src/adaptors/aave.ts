import { FeeAdapter } from "../utils/adapters.type";
import { AVAX, OPTIMISM, FANTOM, HARMONY, ARBITRUM, ETHEREUM, POLYGON } from "../helpers/chains";
import { getStartTimestamp } from "../helpers/getStartTimestamp";
import { request, gql } from "graphql-request";
import { IGraphUrls } from "../helpers/graphs.type";
import { Chain } from "../utils/constants";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../utils/date";
import { V1Reserve, V2Reserve, V3Reserve } from "./helpers/aave"

const poolIDs = {
  V1: '0x24a42fd28c976a61df5d00d0599c34c4f90748c8',
  V2: '0xb53c1a33016b2dc2ff3653530bff1848a515c8c5',
  V2_AMM: '0xacc030ef66f9dfeae9cbb0cd1b25654b82cfa8d5',
  V2_POLYGON: '0xd05e3e715d945b59290df0ae8ef85c1bdb684744',
  V2_AVALANCHE: '0xb6a86025f0fe1862b372cb0ca18ce3ede02a318f',
  V3: '0xa97684ead0e402dc232d5a977953df7ecbab3cdb'
}

const ONE_DAY = 24 * 60 * 60;

const v1Endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/aave/protocol-multy-raw",
}

const v2Endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/aave/protocol-v2",
  [AVAX]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v2-avalanche',
  [POLYGON]: "https://api.thegraph.com/subgraphs/name/aave/aave-v2-matic"
};

const v3Endpoints = {
  [POLYGON]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
  [AVAX]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-avalanche',
  [ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
  [OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-optimism',
  [FANTOM]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-fantom',
  [HARMONY]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-harmony'
}


const v1Reserves = async (graphUrls: IGraphUrls, chain: string, timestamp: number) => {
  const graphQuery = gql
  `{
    reserves(where: { pool: "${poolIDs.V1}" }) {
      id
      paramsHistory(
        where: { timestamp_lte: ${timestamp}, timestamp_gte: ${timestamp - ONE_DAY} },
        orderBy: "timestamp",
        orderDirection: "desc",
        first: 1
      ) {
        id
        priceInUsd
        reserve {
          decimals
          symbol
        }
        lifetimeFlashloanDepositorsFee
        lifetimeFlashloanProtocolFee
        lifetimeOriginationFee
        lifetimeDepositorsInterestEarned
      }
      nextDay: paramsHistory(
        where: { timestamp_gte: ${timestamp}, timestamp_lte: ${timestamp + ONE_DAY} },
        first: 1
      ) {
        id
      }
    }
  }`;

  const graphRes = await request(graphUrls[chain], graphQuery);
  const reserves = graphRes.reserves.map((r: any) => r.paramsHistory[0]).filter((r: any) => r)
  return reserves
}

const v1Graphs = (graphUrls: IGraphUrls) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)

      const todaysReserves: V1Reserve[] = await v1Reserves(graphUrls, chain, todaysTimestamp);
      const yesterdaysReserves: V1Reserve[] = await v1Reserves(graphUrls, chain, yesterdaysTimestamp);

      const dailyFee = todaysReserves.reduce((acc: number, reserve: V1Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

        if (!yesterdaysReserve) {
          return acc;
        }

        const priceInUsd = parseFloat(reserve.priceInUsd);

        const depositorInterest = parseFloat(reserve.lifetimeDepositorsInterestEarned) - parseFloat(yesterdaysReserve.lifetimeDepositorsInterestEarned);
        const depositorInterestUSD = depositorInterest * priceInUsd / (10 ** reserve.reserve.decimals);

        const originationFees = parseFloat(reserve.lifetimeOriginationFee) - parseFloat(yesterdaysReserve.lifetimeOriginationFee);
        const originationFeesUSD = originationFees * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanDepositorsFees = parseFloat(reserve.lifetimeFlashloanDepositorsFee) - parseFloat(yesterdaysReserve.lifetimeFlashloanDepositorsFee);
        const flashloanDepositorsFeesUSD = flashloanDepositorsFees * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanProtocolFees = parseFloat(reserve.lifetimeFlashloanProtocolFee) - parseFloat(yesterdaysReserve.lifetimeFlashloanProtocolFee);
        const flashloanProtocolFeesUSD = flashloanProtocolFees * priceInUsd / (10 ** reserve.reserve.decimals);

        return acc
          + depositorInterestUSD
          + originationFeesUSD
          + flashloanProtocolFeesUSD
          + flashloanDepositorsFeesUSD;
      }, 0);

      const dailyRev = todaysReserves.reduce((acc: number, reserve: V1Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

        if (!yesterdaysReserve) {
          return acc;
        }

        const priceInUsd = parseFloat(reserve.priceInUsd);

        const originationFees = parseFloat(reserve.lifetimeOriginationFee) - parseFloat(yesterdaysReserve.lifetimeOriginationFee);
        const originationFeesUSD = originationFees * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanProtocolFees = parseFloat(reserve.lifetimeFlashloanProtocolFee) - parseFloat(yesterdaysReserve.lifetimeFlashloanProtocolFee);
        const flashloanProtocolFeesUSD = flashloanProtocolFees * priceInUsd / (10 ** reserve.reserve.decimals);

        return acc
          + originationFeesUSD
          + flashloanProtocolFeesUSD
      }, 0);
      
      return {
        timestamp,
        totalFees: "0",
        dailyFees: dailyFee.toString(),
        totalRevenue: "0",
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};


const v2Reserves = async (graphUrls: IGraphUrls, chain: string, timestamp: number) => {
  const graphQuery = gql
  `{
    reserves(where: { pool: "${poolIDs.V1}" }) {
      id
      paramsHistory(
        where: { timestamp_lte: ${timestamp}, timestamp_gte: ${timestamp - ONE_DAY} },
        orderBy: "timestamp",
        orderDirection: "desc",
        first: 1
      ) {
        id
        priceInUsd
        reserve {
          decimals
          symbol
        }
        lifetimeFlashloanDepositorsFee
        lifetimeFlashloanProtocolFee
        lifetimeOriginationFee
        lifetimeDepositorsInterestEarned
      }
      nextDay: paramsHistory(
        where: { timestamp_gte: ${timestamp}, timestamp_lte: ${timestamp + ONE_DAY} },
        first: 1
      ) {
        id
      }
    }
  }`;

  const graphRes = await request(graphUrls[chain], graphQuery);
  const reserves = graphRes.reserves.map((r: any) => r.paramsHistory[0]).filter((r: any) => r)
  return reserves
}

const v2Graphs = (graphUrls: IGraphUrls) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)

      const todaysReserves: V2Reserve[] = await v2Reserves(graphUrls, chain, todaysTimestamp);
      const yesterdaysReserves: V2Reserve[] = await v2Reserves(graphUrls, chain, yesterdaysTimestamp);

      const dailyFee = todaysReserves.reduce((acc: number, reserve: V2Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

        if (!yesterdaysReserve) {
          return acc;
        }

        const priceInUsd = chain == 'avax' ? parseFloat(reserve.priceInUsd) / (10 ** 8) : parseFloat(reserve.priceInUsd)

        const depositorInterest = parseFloat(reserve.lifetimeDepositorsInterestEarned) - (parseFloat(yesterdaysReserve?.lifetimeDepositorsInterestEarned) || 0);
        const depositorInterestUSD = depositorInterest * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanPremium = parseFloat(reserve.lifetimeFlashLoanPremium) - (parseFloat(yesterdaysReserve?.lifetimeFlashLoanPremium) || 0);
        const flashloanPremiumUSD = flashloanPremium * priceInUsd / (10 ** reserve.reserve.decimals);

        const reserveFactor = parseFloat(reserve.lifetimeReserveFactorAccrued) - (parseFloat(yesterdaysReserve.lifetimeReserveFactorAccrued) || 0);
        const reserveFactorUSD = reserveFactor * priceInUsd / (10 ** reserve.reserve.decimals);

        return acc
          + depositorInterestUSD
          + flashloanPremiumUSD
          + reserveFactorUSD;
      }, 0);

      const dailyRev = todaysReserves.reduce((acc: number, reserve: V2Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

        if (!yesterdaysReserve) {
          return acc;
        }

        const priceInUsd = chain == 'avax' ? parseFloat(reserve.priceInUsd) / (10 ** 8) : parseFloat(reserve.priceInUsd)

        const reserveFactor = parseFloat(reserve.lifetimeReserveFactorAccrued) - (parseFloat(yesterdaysReserve.lifetimeReserveFactorAccrued) || 0);
        const reserveFactorUSD = reserveFactor * priceInUsd / (10 ** reserve.reserve.decimals);

        return acc
          + reserveFactorUSD;
      }, 0);
      
      return {
        timestamp,
        totalFees: "0",
        dailyFees: dailyFee.toString(),
        totalRevenue: "0",
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};

const adapter: FeeAdapter = {
  breakdown: {
    v1: {
      [ETHEREUM]: {
        fetch: v1Graphs(v1Endpoints)(ETHEREUM),
        start: 1578459600
      },
    },
    v2: {
      [AVAX]: {
        fetch: v2Graphs(v2Endpoints)(AVAX),
        start: 1606971600
      },
      [ETHEREUM]: {
        fetch: v2Graphs(v2Endpoints)(ETHEREUM),
        start: 1606971600
      },
      [POLYGON]: {
        fetch: v2Graphs(v2Endpoints)(POLYGON),
        start: 1606971600
      },
    },
  }
}

export default adapter;
